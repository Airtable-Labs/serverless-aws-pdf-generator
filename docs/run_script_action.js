// Read in input variables
const { baseId, tableId, recordId, targetAttachmentFieldNameOrId, viewId } = input.config()

// Define API endpoint and body
const apiEndpoint = 'https://FILL_THIS_IN.execute-api.us-east-1.amazonaws.com/dev/async' // "sync" available too
const apiKey = 'FILL_THIS_IN'
const apiRequestBody = { baseId, tableId, recordId, targetAttachmentFieldNameOrId, viewId }

// Execute API request
const apiRequest = await fetch(apiEndpoint, {
  method: 'POST',
  body: JSON.stringify(apiRequestBody),
  headers: {
    'X-Api-Key': apiKey,
    'Content-Type': 'application/json'
  }
})

// If API response is non-200, print out the body and throw an error
if (apiRequest.status !== 200) {
  const apiResponse = await apiRequest.text()
  console.error({ apiResponse })
  throw Error('Non-200 status received)')
}

// Otherwise, parse and log the JSON result
const apiResponse = await apiRequest.json()
console.debug({ apiResponse })
