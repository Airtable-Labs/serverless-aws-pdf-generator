const { S3_BUCKET } = process.env

// AWS dependencies and setup
const AWS = require('aws-sdk')
const s3 = new AWS.S3()
const secretManager = new AWS.SecretsManager()

// Other 3P dependencies
const fs = require('fs-extra')
const fetch = require('node-fetch')

// Local dependencies
const C = require('./constants')

// This "wrapper" function is used across both the async and sync code paths
const wrapperForRecordRetrievalThroughRecordUpdateWithPdf = async ({ baseId, tableId, recordId, viewId, targetAttachmentFieldNameOrId }, SECRET_MANAGER_SECRET_WITH_AIRTABLE_API_KEY, pdfGenFunction) => {
  // Retrieve Airtable API key from AWS Secret Manager
  const airtableApiKey = await retrieveSecretFromSecretManager(SECRET_MANAGER_SECRET_WITH_AIRTABLE_API_KEY)

  // Fetch record data
  const record = await fetchAirtableRecord(airtableApiKey, baseId, tableId, recordId)

  // Fetch Airtable base and reformat object to include only the information necessary
  const baseSchema = await fetchAirtableBaseSchema(airtableApiKey, baseId)
  const tableSchema = baseSchema.tables.filter(t => t.id === tableId)[0]
  tableSchema.view = tableSchema.views.filter(v => v.id === viewId)[0]
  delete tableSchema.views

  // Generate file path config that contains on disk and S3 directory paths used throughout
  const filePathConfig = generateFilePathConfig(baseId, tableId, recordId)

  // Generate PDF and save to disk
  await fs.mkdirSync(filePathConfig.onDiskDirectoryPath, { recursive: true })
  await pdfGenFunction(record, tableSchema, filePathConfig)

  // TODO (get rid of) this hack to make sure the write steam has been closed
  await delay(1000)

  // Upload PDF and generate a URL that's valid for 10 minutes
  const uploadPdfResult = await uploadFromDiskToS3(filePathConfig.onDiskFullPath, filePathConfig.onS3DirectoryPath, filePathConfig.pdfFilename, 'application/pdf')
  const presignedUrlForPdf = await getObjectPresignedUrl(uploadPdfResult.Key, 10)

  // Update Airtable record with generated PDF as attachment using presigned URL
  await updateAirtableRecord(airtableApiKey, baseId, tableId, recordId, { [targetAttachmentFieldNameOrId]: [{ url: presignedUrlForPdf }] })

  return presignedUrlForPdf
}

const retrieveSecretFromSecretManager = async (SecretId, VersionStage = 'AWSCURRENT') => {
  const { SecretString } = await secretManager.getSecretValue({ SecretId, VersionStage }).promise()
  return SecretString
}

const uploadFromDiskToS3 = async (onDiskFullPath, s3PathPrefix, filename, contentType, ACL = 'private') => {
  return await s3
    .upload({
      Bucket: S3_BUCKET,
      Key: `${s3PathPrefix}/${filename}`,
      Body: fs.readFileSync(onDiskFullPath),
      ContentType: contentType,
      ACL
    })
    .promise()
}

const getObjectPresignedUrl = async (key, expirationInMinutes = 10) => {
  return await s3.getSignedUrl('getObject', {
    Bucket: S3_BUCKET,
    Key: key,
    Expires: 60 * expirationInMinutes
  })
}

// From https://github.com/node-fetch/node-fetch/issues/375#issuecomment-385751664
const downloadFileToDisk = async (url, path) => {
  const res = await fetch(url)
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(path)
    res.body.pipe(fileStream)
    res.body.on('error', (err) => {
      reject(err)
    })
    fileStream.on('finish', function () {
      resolve()
    })
  })
}

// Fetch schema of Airtable base (https://airtable.com/developers/web/api/get-base-schema)
const fetchAirtableBaseSchema = async (airtableApiKey, baseId) => {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables?include=visibleFieldIds`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${airtableApiKey}`
    }
  })

  if (!response.ok) {
    console.error('fetch base schema error:', await response.text())
    throw new Error(response.statusText)
  }

  return await response.json()
}

// Fetch schema of Airtable base (https://airtable.com/developers/web/api/get-base-schema)
const fetchAirtableRecord = async (airtableApiKey, baseId, tableIdOrName, recordId) => {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableIdOrName}/${recordId}?returnFieldsByFieldId=true`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${airtableApiKey}`
    }
  })

  if (!response.ok) {
    console.error('fetch airtable record error:', await response.text())
    throw new Error(response.statusText)
  }

  return await response.json()
}

const updateAirtableRecord = async (airtableApiKey, baseId, tableIdOrName, recordId, fields) => {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableIdOrName}/${recordId}?returnFieldsByFieldId=true`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${airtableApiKey}`
    },
    body: JSON.stringify({ fields })
  })

  if (!response.ok) {
    console.error('update airtable record error:', await response.text())
    throw new Error(response.statusText)
  }

  return await response.json()
}

const generateFilePathConfig = (baseId, tableId, recordId) => {
  const absoluteTmpDir = '/tmp'
  const baseTableRecordAsPath = `${baseId}/${tableId}/${recordId}`
  return {
    baseTableRecordAsPath,
    pdfFilename: C.GENERATED_PDF_FILENAME,
    onDiskDirectoryPath: `${absoluteTmpDir}/${baseTableRecordAsPath}/`,
    onS3DirectoryPath: baseTableRecordAsPath,
    onDiskFullPath: `${absoluteTmpDir}/${baseTableRecordAsPath}/${C.GENERATED_PDF_FILENAME}`
  }
}

// Temporary helper function to sleep
const delay = (time) => {
  return new Promise(resolve => setTimeout(resolve, time))
}

module.exports = {
  uploadFromDiskToS3,
  downloadFileToDisk,
  wrapperForRecordRetrievalThroughRecordUpdateWithPdf
}
