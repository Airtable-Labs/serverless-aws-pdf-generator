// Read in environment variables
const { SECRET_MANAGER_SECRET_WITH_AIRTABLE_API_KEY } = process.env

// Local dependencies
const { generateAndSavePdfToDisk } = require('../shared/generateSingleRecordPdf')
const { wrapperForRecordRetrievalThroughRecordUpdateWithPdf } = require('../shared/helpers')

module.exports = async (events) => {
  // Wrap handler code in try/catch and return a generic error to users when necessary
  try {
    // batch size is one, so look at only the first event
    const event = events.Records[0]

    // Parse and validate request body
    const parsedBody = JSON.parse(event.body)

    const presignedUrlForPdf = await wrapperForRecordRetrievalThroughRecordUpdateWithPdf(
      parsedBody,
      SECRET_MANAGER_SECRET_WITH_AIRTABLE_API_KEY,
      generateAndSavePdfToDisk
    )

    return {
      statusCode: 200,
      body: presignedUrlForPdf
    }
  } catch (err) {
    // Log information that may be helpful for debugging
    console.error('Error occurred in handler:')
    console.error({ events, err })
    // re-throw the error so the lambda is considered a failure
    //   and if the error continues, the message is sent to the dead-letter queue
    throw (err)
  }
}
