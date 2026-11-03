// Provider credentials stay on the server. The browser calls only our API.
export const config = { apiEndpoint: '/api/style' };
const $ = (id) => document.getElementById(id);
const styles = {
  casual: { name: '캐주얼', title: '평범한 일상에, 새로운 무드.', description: '편안한 실루엣과 자연스러운 컬러로 완성한 캐주얼 스타일', image: 'photo-1483985988355-763728e1935b' },
  business: { name: '비즈니스', title: '자신감까지 완벽하게 갖춰 입다.', description: '정돈된 실루엣과 절제된 디테일로 완성하는 비즈니스 스타일', image: 'photo-1485968579580-b6d095142e6e' },
  street: { name: '스트리트', title: '당신의 거리, 당신의 규칙.', description: '과감한 조합과 자유로운 감각으로 표현하는 스트리트 스타일', image: 'photo-1529139513065-cff63de5ce1c' },
  vintage: { name: '빈티지', title: '시간이 지나도, 선명한 취향.', description: '클래식한 무드와 따뜻한 감성으로 완성한 빈티지 스타일', image: 'photo-1485230895905-ec40ba36b9bc' },
};
const sampleUrl = $('original').src;
const sampleResultUrl = $('result').src;
let resultObjectUrl = null, sampleFile = null;
let selectedStyle = 'casual', resultStyle = 'casual', photoFile = null, photoUrl = null, busy = false, resultIsDemo = true;
const notify = (message) => { $('notice').textContent = message; };
function resetResult() {
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = null;
  $('result').src = sampleResultUrl;
  $('result').alt = '생성 전 스타일 예시 이미지';
  $('result-style').textContent = '스타일 예시';
  $('result-title').textContent = styles.casual.title;
  $('result-description').textContent = styles.casual.description;
  document.querySelector('.demo-badge').textContent = '● EXAMPLE';
  $('download').disabled = true;
  $('regenerate').hidden = true;
}
function chooseStyle(key) {
  if (busy) return;
  selectedStyle = key;
  document.querySelectorAll('.style-option').forEach(button => {
    const selected = button.dataset.style === key;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
  chooseStyle(button.dataset.style);
  if (button.classList.contains('mood-card')) $('studio').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}));
async function setPhoto(file) {
  if (!file || busy) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notify('JPG, PNG 또는 WEBP 이미지를 선택해 주세요.');
  if (file.size > 4 * 1024 * 1024) return notify('사진 크기는 4MB 이하여야 합니다.');
  const url = URL.createObjectURL(file);
  try {
    const test = new Image(); test.src = url; await test.decode();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoFile = file; photoUrl = url;
    resetResult();
    $('original').src = url; $('original').alt = '업로드한 원본 사진';
    $('upload-title').textContent = file.name;
    $('upload-detail').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · 클릭하여 변경`;
    notify('사진이 준비됐어요. 생성 버튼을 누르면 사진과 요청사항이 OpenAI로 전송됩니다.');
  } catch { URL.revokeObjectURL(url); notify('이미지를 읽을 수 없어요. 다른 사진을 선택해 주세요.'); }
}
$('photo').addEventListener('change', event => setPhoto(event.target.files[0]));
['dragenter', 'dragover'].forEach(type => $('dropzone').addEventListener(type, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); }));
$('dropzone').addEventListener('drop', event => setPhoto(event.dataTransfer.files[0]));
$('sample').addEventListener('click', () => {
  if (busy) return;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoFile = null; photoUrl = null; $('photo').value = '';
  resetResult();
  $('original').src = sampleUrl; $('original').alt = '원본 예시: 블랙 의상을 입은 인물';
  $('upload-title').textContent = '예시 사진을 사용하고 있어요'; $('upload-detail').textContent = '클릭해서 내 사진으로 변경하기';
  notify('예시 사진이 준비됐어요. 생성하면 이 사진으로 실제 AI 편집을 요청합니다.');
});
$('prompt').addEventListener('input', () => { $('count').textContent = `${$('prompt').value.length} / 500`; });
function setView(slider) {
  $('comparison').classList.toggle('slider-mode', slider);
  document.querySelector('.original-frame').style.clipPath = slider ? `inset(0 ${100 - Number($('compare-range').value)}% 0 0)` : '';
  $('side-view').classList.toggle('selected', !slider); $('slider-view').classList.toggle('selected', slider);
  $('side-view').setAttribute('aria-pressed', String(!slider)); $('slider-view').setAttribute('aria-pressed', String(slider));
}
$('side-view').addEventListener('click', () => setView(false));
$('slider-view').addEventListener('click', () => setView(true));
$('compare-range').addEventListener('input', event => {
  const value = Number(event.target.value);
  document.querySelector('.original-frame').style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  $('slider-line').style.left = `${value}%`;
});
function showProgress(percent, text) { $('progress-fill').style.width = `${percent}%`; $('progress-percent').textContent = `${percent}%`; $('progress-text').textContent = text; }
async function generateStyling({ file, style, prompt }) {
  if (!file) {
    if (sampleFile) file = sampleFile;
  }
  if (!file) {
    showProgress(20, '예시 사진을 준비하고 있어요…');
    const sample = await fetch(sampleUrl, { signal: AbortSignal.timeout(30000) });
    if (!sample.ok) throw new Error('예시 사진을 불러오지 못했어요. 내 사진을 업로드해 주세요.');
    const blob = await sample.blob();
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
    if (!extension || blob.size > 4 * 1024 * 1024) throw new Error('예시 사진을 사용할 수 없어요. 내 사진을 업로드해 주세요.');
    file = new File([blob], `sample.${extension}`, { type: blob.type });
    sampleFile = file;
  }
  showProgress(40, 'AI가 옷차림을 편집하고 있어요. 몇 분 걸릴 수 있어요…');
  const form = new FormData(); form.append('image', file); form.append('style', style); form.append('prompt', prompt);
  const response = await fetch(config.apiEndpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(270000) });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || (response.status === 413 ? '사진 용량이 서버 제한을 초과했어요. 더 작은 사진을 사용해 주세요.' : '이미지 편집에 실패했어요. 잠시 후 다시 시도해 주세요.'));
  }
  const blob = await response.blob();
  if (blob.type !== 'image/jpeg' || !blob.size) throw new Error('서버에서 유효한 결과 이미지를 받지 못했어요. 다시 생성해 주세요.');
  showProgress(85, '편집이 완료됐어요. 결과 이미지를 불러오고 있어요…');
  return { imageUrl: URL.createObjectURL(blob), demo: false };
}
async function runStyling() {
  if (busy) return;
  busy = true;
  const style = selectedStyle;
  const controls = [...document.querySelectorAll('.style-option, .mood-card, #photo, #sample, #prompt, #generate, #regenerate, #download')];
  controls.forEach(control => control.disabled = true);
  const preview = document.querySelector('.preview');
  preview.setAttribute('aria-busy', 'true');
  $('progress').hidden = false;
  showProgress(10, '원본 사진으로 이미지 편집을 요청하고 있어요…');
  let pendingUrl = null;
  try {
    const output = await generateStyling({ file: photoFile, style, prompt: $('prompt').value.trim() });
    pendingUrl = output.imageUrl;
    const image = new Image(); image.src = output.imageUrl; await image.decode();
    $('result').src = output.imageUrl;
    if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = output.imageUrl; pendingUrl = null;
    $('result').alt = `${styles[style].name} ${output.demo ? '스타일 예시 룩북' : 'AI 스타일링 결과'}`;
    $('result-style').textContent = `${styles[style].name} 룩`;
    $('result-title').textContent = styles[style].title;
    $('result-description').textContent = styles[style].description;
    resultStyle = style; resultIsDemo = output.demo;
    document.querySelector('.demo-badge').textContent = output.demo ? '● DEMO PREVIEW' : '✧ AI RESULT';
    showProgress(100, '룩북이 준비됐어요!');
    $('download').setAttribute('aria-label', '생성된 스타일링 이미지 다운로드');
    notify('편집이 완료됐어요. 얼굴·포즈·손과 의상 디테일을 원본과 비교해 주세요. 원하는 결과가 아니면 원본으로 다시 생성할 수 있어요.');
  } catch (error) {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    notify(error.name === 'TimeoutError' ? '요청 시간이 초과됐어요. 이전 요청이 처리되었을 수 있으니 잠시 후 다시 시도해 주세요.' : error.message || '이미지 편집에 실패했어요. 사진이나 요청사항을 변경하고 다시 시도해 주세요.');
  } finally {
    busy = false; controls.forEach(control => control.disabled = false);
    $('download').disabled = !resultObjectUrl;
    $('regenerate').hidden = false;
    preview.setAttribute('aria-busy', 'false'); $('progress').hidden = true;
  }
}
$('generate').addEventListener('click', runStyling);
$('regenerate').addEventListener('click', runStyling);
$('download').addEventListener('click', async () => {
  $('download').disabled = true;
  try {
    const response = await fetch($('result').src);
    if (!response.ok) throw new Error('download');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('invalid image');
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `forme-${resultStyle}${resultIsDemo ? '-demo' : ''}.${extension}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify(`${resultIsDemo ? '예시 룩북' : '룩북'} 이미지 다운로드를 시작했어요.`);
  } catch { notify('이미지를 저장하지 못했어요. 인터넷 연결과 이미지 서버의 다운로드 허용 설정을 확인해 주세요.'); }
  finally { $('download').disabled = false; }
});
