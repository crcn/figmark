import * as React from "react";
import * as ReactDOM from "react-dom";
import * as cx from "classnames";
import {
  ButtonPrimary,
  ButtonPrimary_Label3,
  ButtonPrimary_Background3,
  classNames,
} from "./design-generated/test/figmark-2.pc";
import styled from "styled-components";

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

const App = () => {
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

const mount = document.createElement("div");
document.body.appendChild(mount);
ReactDOM.render(<App />, mount);
