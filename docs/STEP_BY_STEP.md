# Setup instructions

📚 Be sure to read [the main README.md](../README.md) before following these instructions

---

_Prerequisites_:
- These instructions assume you have familiarity with Node/Javascript, the [Serverless Framework](https://www.serverless.com/framework/docs), [AWS](https://aws.amazon.com/) (CloudFormation, Lambda, S3, SQS, SNS, and Secrets Manager are used), and Airtable ([Automations](https://support.airtable.com/docs/automations-overview) and [Web APIs](https://airtable.com/developers/web)).
- You should have [AWS credentials setup locally that can be used by the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html). Note that while broad IAM permissions are necessary to deploy the infrastructure, the serverless functions themselves will have the least amount of IAM privileges necessary to function.
- You'll also want to have an Airtable base setup with records you want to generate PDFs of. You can copy [this example base](https://airtable.com/shr8w2nLveBPq8V63). In your base, be sure to have:
  - At least one table with one record
  - An attachments field where you want to the generated PDF to be added to (named `Generated PDF` in the example base)
  - A grid view with the fields you want to be included in the generated PDF (named `View for PDF generation` in the example base)
- You should also have a local environment variable `MY_WORK_EMAIL` set with an email address that identifies you and can receive emails. The email is used to populate a `createdBy` tag on most AWS resources the [serverless.yml](./serverless.yml) CloudFormation creates and an AWS SNS topic subscription which will get an alert when messages are sent to the [dead letter queue](https://en.wikipedia.org/wiki/Dead_letter_queue) (more on that later). 

1. Clone this repository
2. Install Node dependencies: `npm install`
    - Note, only a subset of the required local `devDependencies` will be part of the deployed serverless function packages
3. Review `serverless.yml` to see which infrastructure will be created
    - Update the `service` name value to a unique name (it's used to generate the storage bucket name, among other things, which needs to be globally unique).
    - You may also want to modify other settings such as the cloud provider's region or other settings
4. Deploy the `dev` stage to your AWS account: `npm run deploy:dev`, optionally adding `-- --aws-profile YOUR_AWS_PROFILE_NAME` if using [named AWS credential profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)
    - Take note of the `api keys` and `endpoints` values, we'll use them in the configuration of the Airtable Automation in a future step. These can also be retrieved from the AWS console in the future if you need.
    - You should also receive an email from AWS
5. In the previous step, secret named `/$YOUR_SERVICE_NAME/dev/AIRTABLE_API_KEY` was created in AWS Secrets Manager with a placeholder value. Visit the Secrets Manager UI through the AWS Console and populate this secret with [a new Airtable Personal Access Token](https://airtable.com/create/tokens/new) that has [scopes](https://airtable.com/developers/web/api/scopes) `data.records:read`, `data.records:write`, and `schema.bases:read` for the base/workspace you will be using this code with. Each time the serverless function initializes, it will retrieve this securely stored secret.
6. Before testing from within Airtable, let's test by asking the Serverless framework to invoke the function locally (though it will still reference live AWS Secrets Manager, and save to S3).
    - First, populate [`sample_events/apigw-post-sync.yml`](./sample_events/apigw-post-sync.yml) with the relevant IDs. The simplest way to retrieve all the IDs necessary is to navigate to navigate to and expand the record you want to generate a PDF for from within your `View for PDF generation`. The URL in your browser's address bar should follow the following pattern: `https://airtable.com/appXXX/tblXXX/viwXXX/recXXX`. You can find the field ID through field manager or your base's API documentation.
    - Run `npm run invoke:live:sync` (optionally adding `-- --aws-profile YOUR_AWS_PROFILE_NAME`). This will trigger the live version of the code (in AWS) with the inputs (defined in .yml file in the previous bullet point). This `sync` (short for synchronous) version waits while the PDF is generated and the Airtable record is updated before returning a response.
    - You should see an API response that looks like: `{"statusCode": 200, "body": "https://YOUR_BUCKET_NAME.s3.amazonaws.com/appXXX/tblXXX/recXXX/generated.pdf?...AWS_PRESIGNED_URL_STUFF_HERE...}"` and be able both visit the URL to view the generated PDF. Also check to make sure the record within Airtable was updated with the PDF in the attachment field. 
7. Now that you have confidence that the live version of the code hosted in AWS is working for your sample record, you'll want to setup an Airtable Automation to call the `async` version of the API and update the attachment field when desired. For example, the example base has the following Automation configured to (re)generate a PDF for a record when a checkbox field is checked:
    - Trigger: [When a record matches a condition](https://support.airtable.com/docs/when-a-record-matches-conditions-trigger)
      - Condition: A checkbox named `(re)Generate PDF` is _checked_
    - Action: [Run a script action](https://support.airtable.com/docs/run-a-script-action)
      - Input variables: (it's important that the names match exactly)
        - Name: `baseId`; Value: Your base ID (`appXXX`)
        - Name: `tableId`; Value: Your table ID (`tblXXX`)
        - Name: `recordId`; Value: use the expression builder (blue square with white plus sign) to select  the `Airtable record ID` from the Automation's trigger -- we want to (re)generate the PDF for the record which triggered the automation execution
        - Name: `targetAttachmentFieldNameOrId`; Value: the field ID or name of the attachment field you want the generated PDF to be stored in
        - Name: `viewId`; Value: the view ID (`viwXXX`) that contains the fields you want to be included in the PDF
      - Code: You can find a copy of the code for the the run script action in [`docs/run_script_action.js`](./docs/run_script_action.js) 
        - Within the code, you'll need to update the `apiEndpoint` and `apiKey` variables to use your API Gateway endpoint and API key which were shown in the output to `npm run deploy:dev`
    - Action: [Update record action](https://support.airtable.com/docs/update-record-action) to 'reset' the checkbox field so it can be used to trigger the automation again in the future 
      - Record ID: use the expression builder (blue square with white plus sign) to select the `Airtable record ID` from the Automation's trigger
      - Fields: `(re)Generate PDF` set to an _unchecked_ checkbox
8. It's time to test the solution you just set up:
    - Turn on the automation you just created
    - Navigate to the table
    - Check the checkbox of a record you want to generate 
    - Within about a minute or less, the generated PDF should be available in the specified attachment field 🎉
    - If it doesn't, check the automation for errors first, followed by your AWS Lambda function's CloudWatch logs

Now that you're up and running, you may also want to setup an Automation that emails the PDF to user(s) whenever the attachment field is updated.