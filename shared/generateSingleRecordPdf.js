const PdfKit = require('pdfkit-table') // pdfkit-table extends pdfkit
const fs = require('fs-extra')

const { uploadFromDiskToS3, downloadFileToDisk } = require('./helpers')
const C = require('./constants')

const generateAndSavePdfToDisk = async (record, tableSchema, filePathConfig) => {
  const doc = new PdfKit()
  doc.pipe(fs.createWriteStream(filePathConfig.onDiskFullPath))
  await pdfContent(doc, record, tableSchema, filePathConfig)
  doc.end()
  return filePathConfig.onDiskFullPath
}

const pdfContent = async (doc, record, tableSchema, filePathConfig) => {
  // Use table schema to create mappings
  const { primaryFieldId, fields: allFields, view } = tableSchema
  const visibleFields = allFields.filter(f => view.visibleFieldIds.includes(f.id))
  const fieldsByFieldId = Object.fromEntries(visibleFields.map(f => [f.id, f]))

  // Determine non-attachment fields' names (which will be displayed in a table of field name-value pairs)
  const fieldsIdsToDisplayInTable = Object.entries(fieldsByFieldId).map(f => f[1].type !== 'multipleAttachments' ? f[0] : false).filter(Boolean)

  // Determine attachment fields' names (which we will have their contents replicated to S3 and previewed in the PDF if possible)
  const attachmentFieldIdsToReplicateAndPreview = Object.entries(fieldsByFieldId).map(f => f[1].type === 'multipleAttachments' ? f[0] : false).filter(Boolean)

  resetTextStyle(doc)
  styledText(doc, `${record.fields[primaryFieldId]}`, { bold: true, fontSize: 20, fillColor: C.DEFAULT_TEXT_ACCENT_COLOR })
  styledText(doc, 'View record in Airtable', { link: `https://airtable.com/${filePathConfig.baseTableRecordAsPath}`, fillColor: 'blue', fontSize: 12 })
  doc.moveDown(2)

  // Format fields object into an array of arrays and display table
  const fieldsAsKeyValueArrays = fieldsIdsToDisplayInTable
    .map(fid => [fieldsByFieldId[fid].name, record.fields[fid]])
    .filter(a => typeof (a[1]) !== 'object') // do not render objects though
    .filter(a => a[0] !== fieldsByFieldId[primaryFieldId].name) // or the primary field

  styledText(doc, 'Note: Only fields with non-empty string or numeric values are included in the table below', { fontSize: 12, moveDown: 1 })

  doc.table({
    // title: 'Fields',
    // subtitle: 'Note: Only fields with non-empty string or numeric values are included in the table below',
    headers: [
      { label: 'Name', width: 125 },
      { label: 'Value', width: 300 }
    ],
    rows: fieldsAsKeyValueArrays
  }, {
    prepareHeader: () => doc.font(C.DEFAULT_FONT_BOLD).fontSize(12),
    prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
      doc.font(C.DEFAULT_FONT_REGULAR).fontSize(12)
      if (indexRow % 2 !== 0) { // Shadow every other row
        doc.addBackground(rectRow, 'grey', 0.05)
      }
    }
  })

  for (const fieldId of attachmentFieldIdsToReplicateAndPreview) {
    doc.addPage()
    styledText(doc, fieldsByFieldId[fieldId].name, { bold: true })
    if (record.fields[fieldId]) {
      const imagesEnriched = await processArrayOfAttachments(record.fields[fieldId], filePathConfig)
      displayAndLinkToAttachment(doc, imagesEnriched)
    } else {
      styledText(doc, 'No attachments found', { fontSize: C.DEFAULT_FONT_SIZE * 0.8 })
    }
  }

  return doc
}

const resetTextStyle = (doc) => {
  doc.fontSize(C.DEFAULT_FONT_SIZE).font(C.DEFAULT_FONT_REGULAR).fillColor(C.DEFAULT_TEXT_COLOR)
}

const styledText = (doc, text, options = {}) => {
  options = { bold: false, fillColor: C.DEFAULT_TEXT_COLOR, fontSize: C.DEFAULT_FONT_SIZE, moveDown: 0, link: null, ...options }
  const font = options.bold ? C.DEFAULT_FONT_BOLD : C.DEFAULT_FONT_REGULAR

  doc
    .font(font)
    .fillColor(options.fillColor)
    .fontSize(options.fontSize)
    .text(text, { link: options.link })
    .moveDown(options.moveDown)
}

const processArrayOfAttachments = async (attachments, filePathConfig) => {
  // For each attachment...
  const attachmentsEnriched = await Promise.all(attachments.map(async (i) => {
    // Determine its new filename and paths
    const filenameWithId = `${i.id}__${i.filename}`
    const onDiskFullPath = `${filePathConfig.onDiskDirectoryPath}/${filenameWithId}`
    const onS3DirectoryPath = filePathConfig.baseTableRecordAsPath

    // Download the file to disk (Airtable provides a temporary URL)
    await downloadFileToDisk(i.url, onDiskFullPath)

    // If the file is preview-eligible, convert it to a base64 string (which is necessary to embed a preview in the PDF)
    let base64String
    if (C.IMAGE_TYPES_TO_PREVIEW.includes(i.type)) {
      base64String = await fs.readFile(onDiskFullPath).then(buf => `data:${i.type};base64,` + buf.toString('base64'))
    }

    // Upload the file to S3 as publicly available
    const uploadFileResult = await uploadFromDiskToS3(onDiskFullPath, onS3DirectoryPath, filenameWithId, i.type, 'public-read')

    return {
      ...i,
      nonExpiringS3Url: uploadFileResult.Location,
      ...(base64String && { base64String })
    }
  }))
  return attachmentsEnriched
}

const displayAndLinkToAttachment = (doc, enrichedAttachments) => {
  for (const attachment of enrichedAttachments) {
    // If available, embed the base64 image preview
    if (attachment.base64String) {
      doc.image(attachment.base64String, { height: 250, link: attachment.nonExpiringS3Url })
      doc.moveDown(0.5)
    }
    // Link to public file on S3
    const cannotBeEmbeddedText = attachment.base64String ? '' : '(No preview)'
    styledText(doc, `${attachment.filename} ${cannotBeEmbeddedText}`, { link: attachment.nonExpiringS3Url, fillColor: 'blue', moveDown: 2 })
  }
}

module.exports = {
  generateAndSavePdfToDisk
}
