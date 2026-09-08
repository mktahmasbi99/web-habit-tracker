let locks = 0;
let original = "";
export function lockScroll() {
  if (locks++ === 0) { original = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  return () => { if (--locks === 0) document.body.style.overflow = original; };
}
