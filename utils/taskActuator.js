const { parentPort, workerData } = require('worker_threads')
const request = require('./request')
const { TryNextItem, StopTask, CompleteTask } = require('./EnumError')
const { logbuild } = require('./log');

(async () => {
  try {
    let logger = {
      ...console, ...logbuild([
        workerData.task.options.command || 'asm',
        workerData.task.taskName,
        'worker'
      ])
    };
    let [file, method] = workerData.task.callback
    let task = require(file)
    let _request = request(workerData.task.options.cookies)
    if (method in task) {
      await task[method](_request, workerData.argvs)
    } else {
      logger.error('未知方法', method)
    }
    parentPort.postMessage(JSON.stringify({
      type: 'CompleteTask'
    }))
  } catch (err) {
    let message
    if (err instanceof TryNextItem) {
      message = {
        type: 'TryNextItem',
        data: err.message
      }
    } else if (err instanceof StopTask) {
      message = {
        type: 'StopTask',
        data: err.message
      }
    } else if (err instanceof CompleteTask) {
      message = {
        type: 'CompleteTask',
        data: err.message
      }
    } else {
      message = {
        type: 'Error',
        data: err.message
      }
    }
    parentPort.postMessage(JSON.stringify(message))
  }
})()
