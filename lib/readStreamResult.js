var ReadStreamResult = {
    Success: 0,
    NoStream: 1,
    StreamDeleted: 2,
    NotModified: 3,
    Error: 4,
    AccessDenied: 5,

    /***
     * Returns a nice name for a ReadStreamResult value
     */
    getName: function(result) {
        for(var key in ReadStreamResult) {
            if (ReadStreamResult.hasOwnProperty(key)) {
                if (ReadStreamResult[key] == result) {
                    return key;
                }
            }
        }
        return result.toString();
    }
};

module.exports = ReadStreamResult;