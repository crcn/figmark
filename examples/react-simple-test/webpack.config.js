const path = require("path");
const webpack = require("webpack");

const HtmlWebpackPlugin = require("html-webpack-plugin");

/*
 * We've enabled HtmlWebpackPlugin for you! This generates a html
 * page for you when you compile webpack, which will make you start
 * developing and prototyping faster.
 *
 * https://github.com/jantimon/html-webpack-plugin
 *
 */

module.exports = {
  mode: "development",
  entry: "./src/entry.tsx",

  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
  },
  devtool: false,

  plugins: [new HtmlWebpackPlugin()],

  module: {
    rules: [
      {
        test: /\.(ts|tsx)?$/,
        loader: "ts-loader",
        include: [path.resolve(__dirname, "src")],
        exclude: [/node_modules/],
      },
      {
        test: /\.pc$/,
        loader: "paperclip-loader",
        include: [path.resolve(__dirname, "src")],
        exclude: [/node_modules/],
        options: {
          config: require("./pcconfig.json"),
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        use: [
          {
            loader: "file-loader",
          },
        ],
      },
    ],
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
};
