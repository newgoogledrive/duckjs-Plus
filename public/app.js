// public/app.js
const urlInput = document.getElementById('url');
const viewer = document.getElementById('viewer');
const openNew = document.getElementById('open-new');

function go() {
  let val = urlInput.value.trim();
  if (!val) return false;
  if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
  const prox = '/proxy?url=' + encodeURIComponent(val);
  viewer.src = prox;
  return false;
}

openNew.addEventListener('click', () => {
  let val = urlInput.value.trim();
  if (!val) return;
  if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
  // open proxied version in new tab
  const prox = '/proxy?url=' + encodeURIComponent(val);
  window.open(prox, '_blank');
});

// quick sample
urlInput.value = 'https://example.com';
