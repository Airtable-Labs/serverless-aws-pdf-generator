
// Read in environment variables
const { SECRET_MANAGER_SECRET_WITH_AIRTABLE_API_KEY } = process.env

// Local dependencies
const { generateAndSavePdfToDisk } = require('../shared/generateSingleRecordPdf')
const { wrapperForRecordRetrievalThroughRecordUpdateWithPdf } = require('../shared/helpers')
const C = require('../shared/constants')

module.exports = async ({ body }) => {
  // Wrap handler code in try/catch and return a generic error to users when necessary
  try {
    // Parse and validate request body
    const parsedBody = JSON.parse(body)
    const requiredInputKeys = C.REQUIRED_INPUT_KEYS
    if (JSON.stringify(Object.keys(parsedBody).sort()) !== JSON.stringify(requiredInputKeys)) {
      throw Error(
        'Body must include all of the following input keys: ' +
        requiredInputKeys.join(',')
      )
    }

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
    console.error({ body, err })
    return {
      statusCode: 400,
      body: 'An error occurred'
    }
  }
}
