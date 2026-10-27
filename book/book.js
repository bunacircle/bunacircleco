const form = document.querySelector("#booking-form");
const steps = [...document.querySelectorAll(".form-step")];
const progressItems = [...document.querySelectorAll("[data-progress-step]")];
const previousButton = document.querySelector("#previous-step");
const nextButton = document.querySelector("#next-step");
const submitButton = document.querySelector("#submit-inquiry");
const stepCounter = document.querySelector("#step-counter");
const formStatus = document.querySelector("#form-status");
const successPanel = document.querySelector("#booking-success");
let currentStep = 0;

const setStatus = (message = "") => {
  formStatus.textContent = message;
  formStatus.hidden = !message;
};

const showStep = (index, moveFocus = true) => {
  currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, stepIndex) => {
    const active = stepIndex === currentStep;
    step.hidden = !active;
    step.classList.toggle("active", active);
  });
  progressItems.forEach((item, stepIndex) => {
    item.classList.toggle("active", stepIndex === currentStep);
    item.classList.toggle("complete", stepIndex < currentStep);
    item.setAttribute("aria-current", stepIndex === currentStep ? "step" : "false");
  });
  stepCounter.textContent = `Step ${currentStep + 1} of ${steps.length}`;
  previousButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  setStatus();

  if (moveFocus) {
    const target = steps[currentStep].querySelector("input, select, textarea");
    target?.focus({ preventScroll: true });
    document.querySelector(".booking-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

const toggleConditionalField = (checkbox) => {
  const targetId = checkbox.dataset.reveals;
  if (!targetId) return;
  const target = document.querySelector(`#${targetId}`);
  const input = target.querySelector("input");
  target.hidden = !checkbox.checked;
  input.required = checkbox.checked;
  if (!checkbox.checked) input.value = "";
};

document.querySelectorAll("[data-reveals]").forEach((checkbox) => {
  checkbox.addEventListener("change", () => toggleConditionalField(checkbox));
  toggleConditionalField(checkbox);
});

const validateCheckboxGroup = (name, step) => {
  const group = step.querySelector(`[data-required-group="${name}"]`);
  if (!group) return true;
  const checked = group.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
  group.classList.toggle("is-invalid", !checked);
  const error = group.querySelector(`[data-group-error="${name}"]`);
  error.textContent = checked ? "" : "Choose at least one option.";
  return checked;
};

const validateTimes = (step) => {
  if (step.dataset.step !== "1") return true;
  const start = step.querySelector('[name="startTime"]');
  const end = step.querySelector('[name="endTime"]');
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const valid = !start.value || !end.value || minutes(end.value) - minutes(start.value) >= 60;
  end.setCustomValidity(valid ? "" : "End time must be at least one hour after start time.");
  return valid;
};

const validateStep = (step) => {
  step.classList.add("was-validated");
  const groupsValid = ["eventTypes", "preferredServices"]
    .map((name) => validateCheckboxGroup(name, step))
    .every(Boolean);
  const timesValid = validateTimes(step);
  const controls = [...step.querySelectorAll("input, select, textarea")].filter((control) => !control.disabled);
  const controlsValid = controls.every((control) => control.checkValidity());

  if (!groupsValid || !timesValid || !controlsValid) {
    const firstInvalid = step.querySelector(":invalid, .is-invalid input");
    if (!step.hidden) firstInvalid?.focus();
    setStatus(timesValid ? "Please complete the highlighted fields before continuing." : "End time must be at least one hour after start time.");
    return false;
  }
  return true;
};

nextButton.addEventListener("click", () => {
  if (validateStep(steps[currentStep])) showStep(currentStep + 1);
});

previousButton.addEventListener("click", () => showStep(currentStep - 1));

form.addEventListener("input", (event) => {
  event.target.setCustomValidity("");
  setStatus();
});

const formValues = () => {
  const data = new FormData(form);
  return {
    contactName: String(data.get("contactName") || "").trim(),
    email: String(data.get("email") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    organization: String(data.get("organization") || "").trim(),
    eventTypes: data.getAll("eventTypes").map(String),
    otherEventType: String(data.get("otherEventType") || "").trim(),
    eventDate: String(data.get("eventDate") || ""),
    startTime: String(data.get("startTime") || ""),
    endTime: String(data.get("endTime") || ""),
    setting: String(data.get("setting") || ""),
    electricity: String(data.get("electricity") || ""),
    guestCount: Number(data.get("guestCount")),
    location: String(data.get("location") || "").trim(),
    preferredServices: data.getAll("preferredServices").map(String),
    otherService: String(data.get("otherService") || "").trim(),
    customService: String(data.get("customService") || ""),
    budgetRange: String(data.get("budgetRange") || ""),
    notes: String(data.get("notes") || "").trim(),
    consent: data.get("consent") === "yes",
    website: String(data.get("website") || ""),
  };
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  if (currentStep < steps.length - 1) {
    if (validateStep(steps[currentStep])) showStep(currentStep + 1);
    return;
  }
  if (!steps.every(validateStep)) {
    const invalidStep = steps.findIndex((step) => step.querySelector(":invalid, .is-invalid"));
    showStep(invalidStep >= 0 ? invalidStep : 0);
    setStatus("Please complete the highlighted fields before continuing.");
    return;
  }

  const payload = formValues();
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  setStatus();

  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result?.error?.message || "We could not send your inquiry.");
    }

    form.hidden = true;
    document.querySelector(".form-progress").hidden = true;
    document.querySelector(".form-heading").hidden = true;
    document.querySelector("#success-email").textContent = payload.email;
    successPanel.hidden = false;
    successPanel.focus();
  } catch (error) {
    setStatus(error.message || "We could not send your inquiry. Please try again or email bunacircle@gmail.com.");
    submitButton.disabled = false;
  } finally {
    submitButton.textContent = "Send my inquiry";
  }
});

const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
form.elements.eventDate.min = today.toISOString().slice(0, 10);
showStep(0, false);
