module.exports = {
  // Synchronous - HTTP API waits for full processing to complete
  processJobSynchronously: require('./sync'),
  // Asynchronous
  enqueueJobForAsyncQueue: require('./async/enqueueJob'), // HTTP API accepts job and places job into queue
  processJobFromQueue: require('./async/processJob') // function picks work from queue and process
}
