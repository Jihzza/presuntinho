<script lang="ts">
  import { t } from 'svelte-i18n';
  import { profileState, saveProfile } from '$lib/profile/profile-store.svelte';
  import { fileToProfilePhoto } from '$lib/profile/image';
  import { showToast } from '$lib/components/events';

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  let { open, onClose }: Props = $props();

  let name = $state('');
  let emoji = $state('');
  let bio = $state('');
  let photo = $state('');
  let busy = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  // Seed the form from the live store each time it opens.
  $effect(() => {
    if (open) {
      name = profileState.displayName || $t(profileState.nameKey, { default: '' });
      emoji = profileState.emoji;
      bio = profileState.bio;
      photo = profileState.photo;
    }
  });

  async function onFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    try {
      photo = await fileToProfilePhoto(file);
    } catch {
      showToast($t('profile.edit.photo_error', { default: 'Não deu para usar essa imagem.' }), 2400);
    } finally {
      busy = false;
      if (fileInput) fileInput.value = '';
    }
  }

  async function save(): Promise<void> {
    busy = true;
    try {
      await saveProfile({
        displayName: name.trim(),
        emoji: emoji.trim() || profileState.emoji,
        bio: bio.trim(),
        photo
      });
      showToast($t('profile.edit.saved', { default: 'Perfil atualizado ✓' }), 2000);
      onClose();
    } catch {
      showToast($t('profile.edit.save_error', { default: 'Não deu para guardar.' }), 2400);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <div class="pe-backdrop" role="presentation" onclick={onClose}>
    <div
      class="pe-sheet"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={$t('profile.edit.title', { default: 'Editar perfil' })}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <h2>{$t('profile.edit.title', { default: 'Editar perfil' })}</h2>

      <div class="pe-photo">
        <div class="avatar" style={`--c:${profileState.accent}`}>
          {#if photo}
            <img src={photo} alt="" />
          {:else}
            <span aria-hidden="true">{emoji || '🙂'}</span>
          {/if}
        </div>
        <div class="pe-photo-actions">
          <button type="button" class="ghost" onclick={() => fileInput?.click()} disabled={busy}>
            {$t('profile.edit.choose_photo', { default: 'Escolher foto' })}
          </button>
          {#if photo}
            <button type="button" class="ghost danger" onclick={() => (photo = '')} disabled={busy}>
              {$t('profile.edit.remove_photo', { default: 'Remover' })}
            </button>
          {/if}
        </div>
        <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
      </div>

      <label class="pe-field">
        <span>{$t('profile.edit.name', { default: 'Nome' })}</span>
        <input type="text" bind:value={name} maxlength="40" />
      </label>

      <label class="pe-field emoji">
        <span>{$t('profile.edit.emoji', { default: 'Emoji' })}</span>
        <input type="text" bind:value={emoji} maxlength="4" />
      </label>

      <label class="pe-field">
        <span>{$t('profile.edit.bio', { default: 'Sobre ti' })}</span>
        <textarea bind:value={bio} maxlength="140" rows="2"></textarea>
      </label>

      <div class="pe-actions">
        <button type="button" class="cta" onclick={save} disabled={busy}>
          {busy ? '…' : $t('profile.edit.save', { default: 'Guardar' })}
        </button>
        <button type="button" class="ghost" onclick={onClose} disabled={busy}>
          {$t('profile.edit.cancel', { default: 'Cancelar' })}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pe-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(6, 10, 22, 0.7);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: end center;
  }
  .pe-sheet {
    width: min(30rem, 100%);
    max-height: 90dvh;
    overflow: auto;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
    border-radius: 1.2rem 1.2rem 0 0;
    padding: 1.2rem 1.2rem calc(1.4rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.9rem;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
    animation: pe-up 220ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes pe-up {
    from { transform: translateY(30px); opacity: 0.4; }
    to { transform: translateY(0); opacity: 1; }
  }
  h2 { margin: 0; font-size: 1.3rem; }
  .pe-photo { display: flex; align-items: center; gap: 1rem; }
  .avatar {
    width: 76px;
    height: 76px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 2.2rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--c, #f472b6) 22%, transparent);
    border: 2px solid color-mix(in srgb, var(--c, #f472b6) 60%, transparent);
    flex: 0 0 auto;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .pe-photo-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .pe-field { display: grid; gap: 0.3rem; font-weight: 700; font-size: 0.9rem; }
  .pe-field.emoji input { width: 5rem; text-align: center; font-size: 1.3rem; }
  .pe-field input,
  .pe-field textarea {
    padding: 0.7rem 0.8rem;
    border-radius: 0.7rem;
    border: 1.5px solid color-mix(in srgb, var(--accent, #f472b6) 30%, rgba(255, 255, 255, 0.15));
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt, #fff);
    font: inherit;
    font-weight: 600;
  }
  .pe-actions { display: flex; gap: 0.6rem; margin-top: 0.3rem; }
  .cta {
    flex: 1;
    padding: 0.9rem;
    border: none;
    border-radius: 0.8rem;
    background: linear-gradient(135deg, var(--accent, #f472b6), #a78bfa);
    color: #06121f;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  .ghost {
    padding: 0.9rem 1rem;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.8rem;
    background: transparent;
    color: var(--txt, #fff);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .ghost.danger { color: #fca5a5; border-color: rgba(252, 165, 165, 0.4); }
  button:disabled { opacity: 0.6; cursor: default; }
</style>
