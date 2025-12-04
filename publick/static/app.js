const input = document.getElementById('urlInput');
const button = document.getElementById('goButton');
const iframe = document.getElementById('proxyFrame');

button.addEventListener('click', () => {
    let url = input.value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    iframe.src = '/proxy/' + url;
});
