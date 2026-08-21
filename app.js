const menuData = {
  espresso: [
    ["Espresso", "Double shot · balanced and bright"],
    ["Americano", "Espresso · still or sparkling water"],
    ["Cappuccino", "Espresso · textured milk · cocoa"],
    ["Latte", "Espresso · silky milk · optional flavor"],
  ],
  signature: [
    ["Buna Spice Latte", "Espresso · cardamom · cinnamon · raw sugar"],
    ["Honey Macchiato", "Espresso · local honey · cloud of milk"],
    ["Black Sesame Mocha", "Cocoa · black sesame · espresso · milk"],
    ["Cascara Tonic", "Coffee cherry tea · citrus · tonic"],
  ],
  cold: [
    ["Classic Cold Brew", "Slow-steeped · smooth · refreshing"],
    ["Brown Sugar Shaker", "Espresso · brown sugar · oat milk"],
    ["Iced Buna Latte", "Espresso · cardamom · milk · ice"],
    ["Sparkling Americano", "Espresso · mineral water · orange"],
  ],
};

const renderMenu = (key) => {
  const container = document.querySelector("#menu-items");
  container.innerHTML = menuData[key].map(([name, description]) => `
    <div class="menu-item"><h3>${name}</h3><span>Included</span><p>${description}</p></div>
  `).join("");
  const index = Object.keys(menuData).indexOf(key) + 1;
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

const booking = document.querySelector("#booking-dialog");
document.querySelectorAll("[data-open-booking]").forEach((button) => button.addEventListener("click", () => booking.showModal()));
document.querySelector("[data-close-booking]").addEventListener("click", () => booking.close());
booking.addEventListener("click", (event) => { if (event.target === booking) booking.close(); });

const inquiryEmbed = document.querySelector("#inquiry-embed");
const formUrl = window.BUNA_CIRCLE_CONFIG?.googleFormEmbedUrl;

if (formUrl) {
  const iframe = document.createElement("iframe");
  iframe.src = formUrl;
  iframe.title = "Buna Circle event inquiry form";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute("frameborder", "0");
  inquiryEmbed.replaceChildren(iframe);
} else {
  inquiryEmbed.innerHTML = `
    <div class="inquiry-fallback" role="status">
      <b>Online inquiries are being connected.</b>
      <p>For immediate assistance, email us or call <a href="tel:+17036460333">(703) 646-0333</a>.</p>
      <a class="button" href="mailto:info@bunacircleco.com?subject=Buna%20Circle%20event%20inquiry">Email your inquiry</a>
    </div>`;
}

const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox.querySelector("img");
document.querySelectorAll(".gallery-item").forEach((button) => button.addEventListener("click", () => {
  lightboxImage.src = button.dataset.full;
  lightboxImage.alt = button.querySelector("img").alt;
  lightbox.showModal();
}));
lightbox.querySelector("button").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (event) => { if (event.target === lightbox) lightbox.close(); });
