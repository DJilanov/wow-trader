const rules = require("./webpack.rules.cjs");

module.exports = {
  module: { rules },
  resolve: {
    extensions: [".js", ".ts", ".tsx"],
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
};
