const goBtn = document.getElementById('goBtn');
const urlInput = document.getElementById('url');
const proxyFrame = document.getElementById('proxyFrame');

goBtn.addEventListener('click', () => {
    let url = urlInput.value.trim();
    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }
    // prepend /proxy/ for the Node HTTP proxy
    proxyFrame.src = `/proxy/${encodeURIComponent(url)}`;
});
