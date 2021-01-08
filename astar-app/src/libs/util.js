let UTIL = {};
UTIL.ERROR_LEVEL = {
    INFO: 1,
    WARNING: 2,
    ERROR: 3
};

UTIL.displayErrorMessage = (msg, level) => {
    let errLevel = '';
    switch(level) {
        case UTIL.ERROR_LEVEL.INFO:
            errLevel = 'Info: ';
            break;
        case UTIL.ERROR_LEVEL.WARNING:
            errLevel = 'Warning: ';
            break;
        case UTIL.ERROR_LEVEL.ERROR:
            errLevel = 'Error: ';
            break;
        default:
            errLevel = 'Info: ';
    }

    console.log(errLevel + msg);
}

export default UTIL;
