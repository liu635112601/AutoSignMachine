class BusinessError extends Error { }
class TryNextItem extends Error { }
class CompleteItem extends Error { }
class CompleteTask extends Error { }
class StopTask extends Error { }
class DisableTask extends Error { }

module.exports = {
    BusinessError,
    TryNextItem,
    CompleteItem,
    CompleteTask,
    StopTask,
    DisableTask
}