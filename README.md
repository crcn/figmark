Figmark is a fully transparent tool that allows you to use Figma designs in your web application in a responsive way.

### Resources

- [Getting Started](#getting-started)
- [Examples](./examples)

### How does it work?

Here are a few button variations in Figma:

![alt figma design](./docs/assets/screenshot.png)

Using [Figmark's CLI tool](#cli-usage), we can download our designs and use them directly in our application code like this:

```jsx
// Designes imported from Figma
import {
  ButtonPrimary,
  ButtonPrimary_Label3,
  ButtonPrimary_Background3,
  classNames,
} from "./design-generated/test/figmark-2.pc";
import * as React from "react";
import * as cx from "classnames";
import styled from "styled-components";

// We can easily add responsiveness to our designs like this
const StyledButton = styled(ButtonPrimary)`
  cursor: pointer;
  display: block;
  display: flex;
  .${classNames.buttonPrimary_background3} {
    padding: 8px 10px;
  }
  .${classNames.buttonPrimary_label3} {
    font-family: Helvetica;
  }
`;

type EnhancedButtonProps = {
  disabled?: boolean,
  primary?: boolean,
  secondary?: boolean,
  children?: React.ReactNode,
};

const EnhancedButton = ({
  disabled,
  secondary,
  children,
}: EnhancedButtonProps) => (
  <StyledButton
    className={cx({
      [classNames.buttonDisabled]: disabled,
      [classNames.buttonSecondary]: secondary,
    })}
  >
    <ButtonPrimary_Background3>
      <ButtonPrimary_Label3>{children}</ButtonPrimary_Label3>
    </ButtonPrimary_Background3>
  </StyledButton>
);

export const ButtonsPreview = () => {
  return (
    <>
      <EnhancedButton>Primary</EnhancedButton>
      <EnhancedButton secondary>Secondary</EnhancedButton>
      <EnhancedButton disabled>Disabled</EnhancedButton>
      <EnhancedButton disabled secondary>
        Disabled Secondary
      </EnhancedButton>
    </>
  );
};
```

Here's what the code above looks like when loaded in a browser:

![alt figma design](./docs/assets/preview-screenshot.png)

That's all there is to it! 🙌

## Getting started

To get started, you'll need to install the CLI tool - go ahead and run:

```
npm install figmark -g
```

After that, `cd` to your project directory, then run:

```
figmark init
```

This will prompt you for a few necessary things, starting with your **Figma personal access key**. You'll need to generate a new one -- here's how you do that:

![alt figma design](./docs/assets/finding-pat.gif)

You'll _then_ be asked to set your **team ID**. You'll find it in the URL when you select a Figma team. Here's what I mean:

![alt figma design](./docs/assets/finding-team.gif)

You'll need to answer a few more questions, then you should be good to go!

After you're done, you can go ahead and download your design files:

```
figmark pull
```

> ☝🏻Run this command whenever you want to update your designs locally.

You _should_ see new files with a `.pc` extension -- these are where your designs are saved to. If you wan to preview them directly, you can do that by using the [Paperclip VS Code extension](https://marketplace.visualstudio.com/items?itemName=crcn.paperclip-vscode-extension).

#### Loading design files (.pc) in code

`*.pc` can be included into React code (more targets are planned). To get started with that, install these dependencies:

```
npm install paperclip paperclip-loader paperclip-cli paperclip-compiler-react --save-dev
```

Also be sure to install these dependencies if you don't have them already:

```
npm install webpack file-loader css-loader style-loader --save-dev
```

Next, you need to configure Webpack. Here's something you can use:

```javascript
const path = require("path");

module.exports = {
  entry: "./src/index.tsx",

  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
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
    extensions: [".js", ".jsx"],
  },
};
```

After setting that up, you can go ahead and start using `*.pc` files in your React code!

### Generating strongly typed templates

If you're using TypeScript, you can generated typed definition files from your designs. Assuming that you have the required paperclip dependencies installed (`npm install paperclip paperclip-cli paperclip-compiler-react`), go ahead and run:

```
paperclip --definition --write
```

☝🏻this will generate `*.pc.d.ts` files for each of your designs.
