
// Bible resources strings
export const DEFAULT_GATEWAY_LANGUAGE: string = 'en';
export const ORIGINAL_LANGUAGE: string = 'originalLanguage';
export const TARGET_LANGUAGE: string = 'targetLanguage';
export const TARGET_BIBLE: string = 'targetBible';
export const LEXICONS: string = 'lexicons';
export const UGL_LEXICON: string = 'ugl';
export const UHL_LEXICON: string = 'uhl';
export const NT_ORIG_LANG: string = 'el-x-koine';
export const NT_ORIG_LANG_BIBLE: string = 'ugnt';
export const OT_ORIG_LANG: string = 'hbo';
export const OT_ORIG_LANG_BIBLE: string = 'uhb';
export const UNALIGNED_THRESHOLD = 25; // percent of unaligned content at which verse it considered unaligned
export const DEFAULT_MAX_COMPLEXITY = 100000; // initial complexity threshold for alignment suggestion training, used to prevent training from taking too long as well as memory overflow
export const MAX_COMPLEXITY = 300000; // maximum complexity threshold for alignment suggestion training that prevents memory overflow
export const MIN_COMPLEXITY = 10000; // minimum complexity threshold for alignment suggestion training
export const WORKER_TIMEOUT = 13 * 60 * 1000; // 13 minutes in milliseconds
export const THRESHOLD_TRAINING_MINUTES = 10; // ideal threshold training time in minutes
export const MIN_THRESHOLD_TRAINING_MINUTES = 8; // minimum threshold training time in minutes
