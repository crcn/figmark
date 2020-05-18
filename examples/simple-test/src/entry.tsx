import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  Button,
  Button_Background,
  Button_Label,
  Button_Star1,
  classNames,
} from "./design-generated/test/figmark-2.pc";
import styled from "styled-components";

const StyledBackground = styled(Button_Background)`
  display: block;
  display: flex;
  padding: 20px;
`;

const StyledStar = styled(Button_Star1)`
  display: inline-block;
  margin-right: 10px;
`;

const StyledLabel = styled(Button_Label)`
  font-family: Helvetica;
`;

const StyledButton = styled(Button)`
  padding: 0px;
  flex-direction: column;
  .${classNames.button_label} {
    font-family: Helvetica;
  }
`;

const App = () => {
  return (
    <StyledButton>
      <StyledBackground>
        <StyledStar />
        <StyledLabel>Label</StyledLabel>
      </StyledBackground>
    </StyledButton>
  );
};

const mount = document.createElement("div");
document.body.appendChild(mount);
ReactDOM.render(<App />, mount);
