import { useState } from "react";

export default function FormulaBreakdown({
  title,
  formula,
  inputs = [],
  steps = [],
  finalAnswer,
  meaningText,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!formula && (!steps || steps.length === 0) && !finalAnswer) {
    return null;
  }

  return (
    <section className="calcCard">
      <div className="calcCardHeader">
        <div className="calcCardTitleWrap">
          <h5>{title}</h5>
          {meaningText ? <p>{meaningText}</p> : null}
        </div>
        <button
          className="calcToggle"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Hide calculation" : "Show calculation"}
        </button>
      </div>

      {open ? (
        <div className="calcCardBody">
          {formula ? (
            <div className="calcFormulaBlock">
              <span className="calcLabel">Formula</span>
              <div className="formulaBox calcFormulaText">{formula}</div>
            </div>
          ) : null}

          {inputs.length > 0 ? (
            <div className="calcInputs">
              {inputs.map((item) => (
                <div className="calcInput" key={`${title}-${item.label}`}>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div className="calcSteps">
              {steps.map((step, index) => (
                <div className="calcStep" key={`${title}-step-${index + 1}`}>
                  <div className="calcStepIndex">Step {index + 1}</div>
                  <div className="calcStepBody">
                    <strong>{step.label}</strong>
                    <p>{step.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {finalAnswer ? (
            <div className="calcFinal">
              <span className="calcLabel">Final answer</span>
              <strong>{finalAnswer}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
