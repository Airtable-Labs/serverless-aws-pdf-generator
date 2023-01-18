const PdfKit = require('pdfkit')
const fetch = require('node-fetch')
const fs = require('fs-extra')

const { uploadFromDiskToS3, downloadFileToDisk } = require('./helpers')

const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_REGULAR = 'Helvetica'
const DEFAULT_FONT_BOLD = 'Helvetica-Bold'
const DEFAULT_TEXT_COLOR = '#000000'
const DEFAULT_TEXT_ACCENT_COLOR = '#E89B47'
const IMAGE_TYPES_TO_PREVIEW = ['image/png', 'image/jpeg']

const resetTextStyle = (doc) => {
  doc.fontSize(DEFAULT_FONT_SIZE).font(DEFAULT_FONT_REGULAR).fillColor(DEFAULT_TEXT_COLOR)
}

const styledText = (doc, text, options = {}) => {
  options = { bold: false, fillColor: DEFAULT_TEXT_COLOR, fontSize: DEFAULT_FONT_SIZE, moveDown: 0, link: null, ...options }
  const font = options.bold ? DEFAULT_FONT_BOLD : DEFAULT_FONT_REGULAR

  doc
    .font(font)
    .fillColor(options.fillColor)
    .fontSize(options.fontSize)
    .text(text, { link: options.link })
    .moveDown(options.moveDown)
}

const processArrayOfAttachments = async (attachments, baseTableRecordDirTuple) => {
  const attachmentsEnriched = await Promise.all(attachments.map(async (i) => {
    // TODO refactor with other file path vars
    const filenameWithId = `${i.id}__${i.filename}`
    const onDiskFullPath = `/tmp/${baseTableRecordDirTuple}/${filenameWithId}`
    const onS3DirectoryPath = baseTableRecordDirTuple

    await downloadFileToDisk(i.url, onDiskFullPath)
    const uploadFileResult = await uploadFromDiskToS3(onDiskFullPath, onS3DirectoryPath, filenameWithId, i.type, 'public-read')

    // TODO use downloaded file on disk instead
    let base64String
    if (IMAGE_TYPES_TO_PREVIEW.includes(i.type)) {
      // one liner from https://stackoverflow.com/questions/17124053 to convert URL+type to base64 string
      base64String = await fetch(i.url).then(r => r.buffer()).then(buf => `data:${i.type};base64,` + buf.toString('base64'))
    }

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
    const cannotBeEmbeddedText = attachment.base64String ? '' : '(Cannot be embedded)'
    styledText(doc, `Link to ${attachment.filename} ${cannotBeEmbeddedText}`, { link: attachment.nonExpiringS3Url, fillColor: 'blue' })
    if (attachment.base64String) {
      doc.image(attachment.base64String, { height: 300, link: attachment.nonExpiringS3Url }).moveDown(2)
    }
  }
}

const pdfContent = async (doc, record, baseTableRecordDirTuple) => {
  resetTextStyle(doc)
  styledText(doc, `TITLE: ${record.fields.Title}`, { bold: true, fontSize: 20, fillColor: DEFAULT_TEXT_ACCENT_COLOR })
  styledText(doc, `SEASON: ${record.fields['Name (from Season)']}`, { bold: true, fillColor: DEFAULT_TEXT_ACCENT_COLOR })
  doc.moveDown(1)
  styledText(doc, `SUBMITTED BY: ${record.fields['Submitted by (email)']}`)
  doc.moveDown(1)
  styledText(doc, 'DETAILS:', { moveDown: 0 })
  styledText(doc, `${record.fields.Details}`)

  doc.addPage()

  styledText(doc, 'IMAGES', { bold: true })
  if (record.fields.Images) {
    const imagesEnriched = await processArrayOfAttachments(record.fields.Images, baseTableRecordDirTuple)
    displayAndLinkToAttachment(doc, imagesEnriched)
  } else {
    styledText(doc, 'No images attached to this record')
  }

  doc.addPage()

  styledText(doc, 'REFERENCE MATERIALS', { bold: true })
  if (record.fields['Reference Materials']) {
    const referenceMaterialsEnriched = await processArrayOfAttachments(record.fields['Reference Materials'], baseTableRecordDirTuple)
    displayAndLinkToAttachment(doc, referenceMaterialsEnriched)
  } else {
    styledText(doc, 'No reference materials attached to this record')
  }

  return doc
}

const generateAndSavePdfToDisk = async (outputFilePath, record, baseTableRecordDirTuple) => {
  const doc = new PdfKit()
  doc.pipe(fs.createWriteStream(outputFilePath))
  await pdfContent(doc, record, baseTableRecordDirTuple)
  doc.end()
  return outputFilePath
}

module.exports = {
  generateAndSavePdfToDisk
}
