const menuKeys = ["espresso", "signature", "cold"];
const menuLabels = {
  espresso: "Espresso bar",
  signature: "Signature drinks",
  cold: "Cold bar",
};

const cupIllustration = (key) => `
  <div class="menu-illustration menu-illustration--${key}">
    <p class="sr-only">${menuLabels[key]} selected</p>
    <svg viewBox="0 0 640 430" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="espresso-cup" viewBox="0 0 180 150">
          <ellipse class="cup-shadow" cx="88" cy="126" rx="73" ry="13" />
          <path class="cup-fill" d="M35 35h102l-8 57c-3 22-19 32-43 32H79c-24 0-40-10-43-32z" />
          <path class="cup-line" d="M137 51h10c29 0 29 44 0 44h-16M35 35h102M48 48c22 8 54 8 76 0" />
        </symbol>
        <symbol id="signature-cup" viewBox="0 0 180 170">
          <ellipse class="cup-shadow" cx="86" cy="145" rx="72" ry="13" />
          <path class="cup-fill" d="M30 38h108v68c0 24-18 37-44 37H74c-26 0-44-13-44-37z" />
          <path class="cup-line" d="M138 58h9c30 0 30 48 0 48h-9M30 38h108" />
          <path class="latte-line" d="M59 67c15-19 35-19 50 0M66 76c11-11 25-11 36 0M78 84c4-4 9-4 13 0" />
        </symbol>
        <symbol id="cold-cup" viewBox="0 0 150 200">
          <ellipse class="cup-shadow" cx="72" cy="181" rx="56" ry="12" />
          <path class="cup-fill" d="M29 41h91l-10 132H40z" />
          <path class="cup-line" d="M23 41h103M58 41l11-27M69 14h35" />
          <path class="ice-line" d="m47 70 23-8 8 24-24 8zm35 27 24-5 5 24-24 5zm-31 29 23-5 5 23-24 5z" />
        </symbol>
      </defs>
      <circle class="menu-orbit menu-orbit--outer" cx="320" cy="211" r="176" />
      <circle class="menu-orbit" cx="320" cy="211" r="120" />
      <g class="bean bean--one"><path d="M0 18C4 1 24-6 37 4s8 31-8 38S-5 35 0 18Z"/><path d="M6 35C15 29 20 16 31 8"/></g>
      <g class="bean bean--two"><path d="M0 18C4 1 24-6 37 4s8 31-8 38S-5 35 0 18Z"/><path d="M6 35C15 29 20 16 31 8"/></g>
      <g class="cup-set cup-set--espresso">
        <use href="#espresso-cup" x="52" y="181" width="180" height="150" />
        <use href="#espresso-cup" x="231" y="104" width="210" height="175" />
        <use href="#espresso-cup" x="416" y="190" width="170" height="142" />
      </g>
      <g class="cup-set cup-set--signature">
        <use href="#signature-cup" x="43" y="170" width="180" height="170" />
        <use href="#signature-cup" x="223" y="84" width="220" height="208" />
        <use href="#signature-cup" x="415" y="176" width="180" height="170" />
      </g>
      <g class="cup-set cup-set--cold">
        <use href="#cold-cup" x="58" y="137" width="150" height="200" />
        <use href="#cold-cup" x="243" y="65" width="170" height="227" />
        <use href="#cold-cup" x="430" y="137" width="150" height="200" />
      </g>
    </svg>
  </div>`;

const renderMenu = (key) => {
  const container = document.querySelector("#menu-items");
  container.innerHTML = cupIllustration(key);
  const index = menuKeys.indexOf(key) + 1;
  document.querySelector(".menu-card-top span:last-child").textContent = `0${index} / 03`;
};

renderMenu("espresso");

const slides = [...document.querySelectorAll(".hero-slide")];
const dots = document.querySelector(".slider-dots");
const slider = document.querySelector(".hero-slider");
const slideStatus = document.querySelector("#slide-status");
let currentSlide = 0;
let slideTimer;

const showSlide = (index, announce = false) => {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("active", i === currentSlide));
  [...dots.children].forEach((dot, i) => {
    dot.classList.toggle("active", i === currentSlide);
    dot.setAttribute("aria-current", i === currentSlide ? "true" : "false");
  });
  if (announce) slideStatus.textContent = `Showing photo ${currentSlide + 1} of ${slides.length}`;
};

slides.forEach((_, index) => {
  const dot = document.createElement("button");
  dot.className = "slider-dot";
  dot.type = "button";
  dot.setAttribute("aria-label", `Show event photo ${index + 1}`);
  dot.addEventListener("click", () => showSlide(index, true));
  dots.append(dot);
});

const startSlider = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  clearInterval(slideTimer);
  slideTimer = setInterval(() => showSlide(currentSlide + 1), 4500);
};
document.querySelector("[data-slide-prev]").addEventListener("click", () => { showSlide(currentSlide - 1, true); startSlider(); });
document.querySelector("[data-slide-next]").addEventListener("click", () => { showSlide(currentSlide + 1, true); startSlider(); });
slider.addEventListener("mouseenter", () => clearInterval(slideTimer));
slider.addEventListener("mouseleave", startSlider);
slider.addEventListener("focusin", () => clearInterval(slideTimer));
slider.addEventListener("focusout", startSlider);
showSlide(0);
startSlider();

document.querySelectorAll("[data-menu]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-menu]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    renderMenu(button.dataset.menu);
  });
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    document.querySelectorAll("[data-category]").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
    });
  });
});

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");
menuToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
}));

const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox.querySelector("img");
document.querySelectorAll(".gallery-item").forEach((button) => button.addEventListener("click", () => {
  lightboxImage.src = button.dataset.full;
  lightboxImage.alt = button.querySelector("img").alt;
  lightbox.showModal();
}));
lightbox.querySelector("button").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (event) => { if (event.target === lightbox) lightbox.close(); });
