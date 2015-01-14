var ReadAllResult = {
    Success: 0,
    NotModified: 1,
    Error: 2,
    AccessDenied: 3,

    /***
     * Returns a nice name for a ReadAllResult value
     */
    getName: function(result) {
        for(var key in ReadAllResult) {
            if (ReadAllResult.hasOwnProperty(key)) {
                if (ReadAllResult[key] == result) {
                    return key;
                }
            }
        }
        return result.toString();
    }
};

module.exports = ReadAllResult;