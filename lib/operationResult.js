var OperationResult = {
    Success: 0,
    PrepareTimeout: 1,
    CommitTimeout: 2,
    ForwardTimeout: 3,
    WrongExpectedVersion: 4,
    StreamDeleted: 5,
    InvalidTransaction: 6,
    AccessDenied: 7,

    // This value isn't technically part of the protocol, but is useful to have, to behave similarly to Read*Result
    Error: -1,

    /***
     * Returns a nice name for an OperationResult value
     */
    getName: function(result) {
        for(var key in OperationResult) {
            if (OperationResult.hasOwnProperty(key)) {
                if (OperationResult[key] == result) {
                    return key;
                }
            }
        }
        return result.toString();
    }
};

module.exports = OperationResult;