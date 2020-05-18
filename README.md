Figmark is a tool that allows you to use Figma designs in your single page application.

### Example

Here are a few button variations in Figma:

![alt figma design](./docs/assets/screenshot.png)

Using [Figmark's CLI tool](#cli-usage), we can convert to code which looks something like this:

```html
<!-- STYLES -->

<style>
  :global(._5710_buttonPrimary) {
    & :global(._579_ButtonPrimary_Background) {
      background: #d0d0d0;
      border-radius: 30px;
    }
    & :global(._5711_ButtonPrimary_Label) {
      mix-blend-mode: multiply;
      display: flex;
      align-items: center;
      font-family: Roboto;
      font-weight: 400;
      font-size: 10px;
      letter-spacing: 0.24em;
      text-align: center;
      font-featutes-settings: "onum" on, "tnum" on;
      color: #716f6f;
    }
  }

  :global(._578_buttons) {
    background: #ffffff;
    overflow: hidden;
  }
  :global(._5720_buttonDisabled) {
    opacity: 0.6000000238418579;
  }

  :global(._5723_buttonSecondary) {
    & :global(._579_ButtonPrimary_Background) {
      background: unset;
      border: 1px solid #d0d0d0;
    }
  }
</style>

<!-- ALL LAYERS & COMPONENTS -->

<div
  export
  component
  as="Buttons"
  data-with-absolute-layout="{withAbsoluteLayout?}"
  className="_578_buttons {className?}"
>
  {children}
</div>

<div
  export
  component
  as="ButtonPrimary"
  data-with-absolute-layout="{withAbsoluteLayout?}"
  className="_5710_buttonPrimary {className?}"
>
  {children}
</div>

<div
  export
  component
  as="ButtonPrimary_Background"
  data-with-absolute-layout="{withAbsoluteLayout?}"
  className="_579_ButtonPrimary_Background {className?}"
>
  {children}
</div>

<span
  export
  component
  as="ButtonPrimary_Label"
  data-with-absolute-layout="{withAbsoluteLayout?}"
  className="_5711_ButtonPrimary_Label {className?}"
>
  {children}
</span>
```

Then by using [Paperclip](https://github.com/crcn/paperclip), we can include the designs directly into our React code and add additional styles for responsiveness:

```jsx
import {
  ButtonPrimary,
  ButtonPrimary_Label,
  ButtonPrimary_Background,
  classNames,
} from "./design-generated/test/figmark-2.pc";
import styled from "styled-components";

const StyledButton = styled(ButtonPrimary)`
  cursor: pointer;
  display: block;
  display: flex;
  .${classNames.buttonPrimary_background} {
    padding: 8px 10px;
  }
  .${classNames.buttonPrimary_label} {
    font-family: Helvetica;
  }
`;

const Demo = () => {
  return (
    <>
      <StyledButton>
        <ButtonPrimary_Background>
          <ButtonPrimary_Label>Label</ButtonPrimary_Label>
        </ButtonPrimary_Background>
      </StyledButton>
      <StyledButton className={classNames.buttonDisabled}>
        <ButtonPrimary_Background>
          <ButtonPrimary_Label>Label</ButtonPrimary_Label>
        </ButtonPrimary_Background>
      </StyledButton>
      <StyledButton className={classNames.buttonSecondary}>
        <ButtonPrimary_Background>
          <ButtonPrimary_Label>Label</ButtonPrimary_Label>
        </ButtonPrimary_Background>
      </StyledButton>
    </>
  );
};
```

Here's the result:

![alt figma design](./docs/assets/preview-screenshot.png)

### CLI usage
