Use Figma designs directly in your web application in a _responsive_ way.

### Resources

- [Getting Started](#getting-started)
- [Examples](./examples)

### How does it work?

Here are a few button variations in Figma:

![alt figma design](./docs/assets/screenshot.png)

Using [Figmark's CLI tool](#getting-started), you can download the Figma design above and use it directly in code:

```tsx
// These are the designs imported from Figma. Each layer is exported as an individual component that corresponds with the layer name. This "slicing up" allows us to add responsive CSS styles to each individual layer.
import {
  // This is the main button
  ButtonPrimary,

  // This is a child of ButtonPrimary -- we know that
  // because ButtonPrimary_ is the prefix.
  ButtonPrimary_Label3,

  // Another child of ButtonPrimary
  ButtonPrimary_Background3,

  // All classnames that correspond with each layer
  classNames,
} from "./design-generated/test/figmark-2";

import * as React from "react";
import * as cx from "classnames";
import styled from "styled-components";

// We can easily add responsiveness to our designs like so
const ResponsiveButton = styled(ButtonPrimary)`
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
  disabled?: boolean;
  primary?: boolean;
  secondary?: boolean;
  children?: React.ReactNode;
};

const EnhancedButton = ({
  disabled,
  secondary,
  children,
}: EnhancedButtonProps) => (
  <ResponsiveButton
    className={cx({
      [classNames.buttonDisabled]: disabled,
      [classNames.buttonSecondary]: secondary,
    })}
  >
    <ButtonPrimary_Background3>
      <ButtonPrimary_Label3>{children}</ButtonPrimary_Label3>
    </ButtonPrimary_Background3>
  </ResponsiveButton>
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

After you're done, you can go ahead and download your design files:

```
figmark pull
```

> ☝🏻Run this command whenever you want to update your designs locally.

That's it! At this point you should have generated React files that you can use directly in your code.

> You'll also notice `*.pc` files which React files are compiled from. To learn more about how to use PC files, you can check out the [Paperclip](https://github.com/crcn/paperclip) repository.
