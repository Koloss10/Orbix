/* ---------- Orbix AI: authenticated, read-only assistant ---------- */
const OAI = { conversationId: null, busy: false, initialized: false, conversations: [] };
const aiEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function aiMessage(role, content) {
  const wrap = document.createElement('article');
  wrap.className = 'ai-msg ' + (role === 'assistant' ? 'assistant' : 'user');
  const label = document.createElement('div');
  label.className = 'ai-msg-role';
  label.textContent = role === 'assistant' ? 'ORBIX AI' : 'ТИ';
  const body = document.createElement('div');
  body.className = 'ai-msg-content';
  body.textContent = content;
  wrap.append(label, body);
  $('#ai-chat').append(wrap);
  $('#ai-chat').scrollTop = $('#ai-chat').scrollHeight;
}
function aiStatus(text, error = false) {
  const el = $('#ai-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('dn', !!error);
}
function aiRenderHistory(rows) {
  const root = $('#ai-chat');
  root.replaceChildren();
  if (!rows.length) {
    aiMessage('assistant', 'Я Orbix AI. Можу аналізувати твоїх ботів, події, результати бектестів і доступні показники ризику. Постав запитання або скористайся швидким запитом нижче.');
    return;
  }
  rows.forEach(row => aiMessage(row.role, row.content));
}
async function aiLoadConversations() {
  if (!SB || !CLOUD.u) { OAI.conversations = []; return; }
  const { data, error } = await SB.from('ai_conversations').select('id,title,updated_at')
    .order('updated_at', { ascending: false }).limit(30);
  if (error) throw error;
  OAI.conversations = data || [];
  const select = $('#ai-conversation');
  if (select) {
    select.innerHTML = '<option value="">Новий діалог</option>' + OAI.conversations
      .map(c => '<option value="' + aiEsc(c.id) + '">' + aiEsc(c.title) + '</option>').join('');
    select.value = OAI.conversationId || '';
  }
}
async function aiLoadMessages(id) {
  if (!SB || !CLOUD.u || !id) { aiRenderHistory([]); return; }
  const { data, error } = await SB.from('ai_messages').select('role,content')
    .eq('conversation_id', id).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  aiRenderHistory(data || []);
}
async function aiInit() {
  if (!$('#ai-chat')) return;
  if (!CLOUD.u || !SB) {
    $('#ai-login-note').hidden = false;
    $('#ai-composer').disabled = true;
    $('#ai-send').disabled = true;
    aiStatus('Увійди в акаунт Orbix, щоб користуватися AI.', true);
    return;
  }
  $('#ai-login-note').hidden = true;
  $('#ai-composer').disabled = false;
  $('#ai-send').disabled = false;
  try {
    await aiLoadConversations();
    if (OAI.conversationId) await aiLoadMessages(OAI.conversationId);
    else aiRenderHistory([]);
    aiStatus('Підключено до Orbix. Режим: лише читання.');
  } catch (e) {
    aiStatus('Не вдалося завантажити історію: ' + (e.message || e), true);
  }
}
async function aiSend(text) {
  const message = String(text ?? $('#ai-composer').value).trim();
  if (!message || OAI.busy) return;
  if (!CLOUD.u || !SB) { aiStatus('Спочатку увійди в акаунт Orbix.', true); return; }
  OAI.busy = true;
  $('#ai-send').disabled = true;
  $('#ai-composer').disabled = true;
  aiMessage('user', message);
  aiStatus('Orbix AI аналізує дані…');
  try {
    const { data, error } = await SB.functions.invoke('ai-assistant', {
      body: { message, conversation_id: OAI.conversationId },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'AI request failed');
    OAI.conversationId = data.conversation_id;
    aiMessage('assistant', data.answer);
    aiStatus('Дані: ' + data.context.bots + ' ботів · ' + data.context.events + ' подій · ' + data.context.backtests + ' бектестів. Знімок: ' + new Date(data.context.generated_at).toLocaleTimeString('uk-UA'));
    await aiLoadConversations();
    $('#ai-conversation').value = OAI.conversationId;
    $('#ai-composer').value = '';
  } catch (e) {
    aiStatus('Помилка AI: ' + (e.message || e), true);
    aiMessage('assistant', 'Не вдалося отримати відповідь. Перевір підключення, налаштування AI та авторизацію. Торгові боти продовжують працювати незалежно від AI.');
  } finally {
    OAI.busy = false;
    $('#ai-send').disabled = false;
    $('#ai-composer').disabled = false;
    $('#ai-composer').focus();
  }
}
function aiNewConversation() {
  OAI.conversationId = null;
  $('#ai-conversation').value = '';
  aiRenderHistory([]);
  aiStatus('Новий діалог. Запитів ще не надсилали.');
}
$('#ai-send').onclick = () => aiSend();
$('#ai-composer').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
});
$('#ai-new').onclick = aiNewConversation;
$('#ai-conversation').onchange = async e => {
  OAI.conversationId = e.target.value || null;
  try { await aiLoadMessages(OAI.conversationId); aiStatus('Історію завантажено.'); }
  catch (er) { aiStatus('Не вдалося завантажити діалог: ' + (er.message || er), true); }
};
$('#ai-quick').onclick = e => {
  const b = e.target.closest('[data-ai-prompt]');
  if (b) aiSend(b.dataset.aiPrompt);
};
