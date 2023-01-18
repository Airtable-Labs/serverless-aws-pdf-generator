// AWS dependencies and setup
const AWS = require('aws-sdk')
const s3 = new AWS.S3()
const secretManager = new AWS.SecretsManager()

const fs = require('fs-extra')
const fetch = require('node-fetch')

const { BUCKET } = process.env

const retrieveSecretFromSecretManager = async (SecretId, VersionStage = 'AWSCURRENT') => {
  const { SecretString } = await secretManager.getSecretValue({ SecretId, VersionStage }).promise()
  return SecretString
}

const uploadFromDiskToS3 = async (onDiskFullPath, s3PathPrefix, filename, contentType, ACL = 'private') => {
  return await s3
    .upload({
      Bucket: BUCKET,
      Key: `${s3PathPrefix}/${filename}`,
      Body: fs.readFileSync(onDiskFullPath),
      ContentType: contentType,
      ACL
    })
    .promise()
}

const getObjectPresignedUrl = async (key, expirationInMinutes = 10) => {
  return await s3.getSignedUrl('getObject', {
    Bucket: BUCKET,
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

// Temporary helper function to sleep
const delay = (time) => {
  return new Promise(resolve => setTimeout(resolve, time))
}

module.exports = {
  retrieveSecretFromSecretManager,
  uploadFromDiskToS3,
  getObjectPresignedUrl,
  downloadFileToDisk,
  delay
}
