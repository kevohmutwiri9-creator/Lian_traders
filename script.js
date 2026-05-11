const ticker = document.querySelector('.ticker');

if (ticker) {
  let scrollStep = 1;
  const speed = 30;
  const animate = () => {
    ticker.scrollLeft += scrollStep;
    if (ticker.scrollLeft >= ticker.scrollWidth - ticker.clientWidth || ticker.scrollLeft <= 0) {
      scrollStep = -scrollStep;
    }
    requestAnimationFrame(animate);
  };
  animate();
}
