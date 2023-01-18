// Load queue name from environment variables
const { QUEUE_NAME: QueueName } = process.env

// Load AWS dependencies
const { SQS } = require('aws-sdk')
const sqs = new SQS()

// Load local dependencies
const C = require('../shared/constants')

module.exports = async (event) => {
  let statusCode
  let message

  // Fail fast if no body was provided
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'No body was found'
      })
    }
  }
  try {
    // Parse the provided body
    const parsedBody = JSON.parse(event.body)

    // If all required values are not found in the body, fail and let the user know why
    if (JSON.stringify(Object.keys(parsedBody).sort()) !== JSON.stringify(C.REQUIRED_INPUT_KEYS)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Body must include all of the following input keys: ' +
            C.REQUIRED_INPUT_KEYS.join(',')
        })
      }
    }

    // Get the queue URL from AWS API
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise()
    // Send the provided body as the body of the SQS message (called "job" in most of this code's docs)
    await sqs.sendMessage({
      QueueUrl,
      MessageBody: event.body
    }).promise()

    statusCode = 200
    message = 'Message accepted!'
  } catch (error) {
    console.error(error)
    message = error
    statusCode = 500
  }

  return {
    statusCode,
    body: JSON.stringify({
      message
    })
  }
}
