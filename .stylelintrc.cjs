module.exports = {
  ignoreFiles: ["v2/static/vendor/**"],
  rules: {
    "no-duplicate-selectors": true,
    "unit-disallowed-list": ["px"],
    "declaration-property-value-disallowed-list": {
      "/^transition(-property)?$/": ["/\\ball\\b/"],
      "/^border(-(top|right|bottom|left))?(-width)?$/": ["/0\\.0625rem/"],
    },
  },
};
