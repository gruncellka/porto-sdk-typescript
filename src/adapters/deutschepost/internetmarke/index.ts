/**
 * Deutsche Post Internetmarke adapter module
 */

export { InternetmarkeAdapter } from "./adapter.js";
export {
    InternetmarkeProductCode,
    InternetmarkeRetryableErrorCode,
    InternetmarkeVendorErrorPattern,
} from "./enums.js";
export { loadInternetmarkeConfig, getInternetmarkeBaseUrl } from "./bootstrap.js";
