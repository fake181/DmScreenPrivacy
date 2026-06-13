import definePlugin from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";



const settings = definePluginSettings({

    hideEntireDm: {
        type: OptionType.BOOLEAN,
        description: "Hide entire DM instead of only messages",
        default: false
    },
    blurMode: {
        type: OptionType.BOOLEAN,
        description: "Blur content instead of hiding it",
        default: true
    }
});



let styleEl:       HTMLStyleElement | null = null;
let interval:      ReturnType<typeof setInterval> | null = null;
let revealBtn:     HTMLButtonElement | null = null;
let lastPath       = "";
let lastShareState = false;

const revealedDMs = new Set<string>();



function injectStyles() {
    if (styleEl) return;

    styleEl = document.createElement("style");
    styleEl.textContent = `
  
        .vc-dm-hidden {
            opacity: 0 !important;
            pointer-events: none !important;
            user-select: none !important;
        }

        .vc-dm-blur {
            filter: blur(16px) !important;
            pointer-events: none !important;
            user-select: none !important;
            transition: filter 0.3s ease;
        }

    
        .vc-hide-sidebar-name {
            color: transparent !important;
            background: var(--background-modifier-selected) !important;
            border-radius: 4px !important;
            user-select: none !important;
            transition: color 0.2s ease, background 0.2s ease;
        }

        
        .vc-dm-btn-wrap {
            display: inline-flex;
            align-items: center;
            margin-right: 8px;
            flex-shrink: 0;
        }

        
        .vc-dm-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            height: 30px;
            padding: 0 10px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12.5px;
            font-weight: 600;
            font-family: var(--font-primary, sans-serif);
            letter-spacing: 0.01em;
            white-space: nowrap;
            flex-shrink: 0;
            transition: background 0.15s ease, opacity 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
            position: relative;
            outline: none;
        }

        
        .vc-dm-btn.vc-btn-reveal {
            background: var(--brand-experiment, #5865f2);
            color: #fff;
            box-shadow: 0 1px 4px rgba(88, 101, 242, 0.35);
        }
        .vc-dm-btn.vc-btn-reveal:hover {
            background: var(--brand-experiment-400, #4752c4);
            box-shadow: 0 2px 8px rgba(88, 101, 242, 0.45);
        }

        
        .vc-dm-btn.vc-btn-hide {
            background: var(--background-modifier-hover, rgba(79,84,92,0.16));
            color: var(--interactive-normal, #b5bac1);
            box-shadow: none;
        }
        .vc-dm-btn.vc-btn-hide:hover {
            background: var(--background-modifier-selected, rgba(79,84,92,0.32));
            color: var(--interactive-hover, #dbdee1);
        }

        .vc-dm-btn:active { transform: scale(0.95); }
        .vc-dm-btn:focus-visible {
            box-shadow: 0 0 0 2px var(--brand-experiment, #5865f2);
        }

        /* Icon inside button */
        .vc-dm-btn svg {
            flex-shrink: 0;
            display: block;
        }
    `;

    document.head.appendChild(styleEl);
}


function isScreenSharing(): boolean {
    return !!(
        document.querySelector('[aria-label*="Stop Streaming"]') ||
        document.querySelector('[aria-label*="Stop Sharing"]')
    );
}

function getCurrentDmId(): string | null {
    return window.location.pathname.match(/\/channels\/@me\/(\d+)/)?.[1] ?? null;
}

function isDm(): boolean {
    return (
        window.location.pathname.startsWith("/channels/@me/") &&
        getCurrentDmId() !== null
    );
}



function findChatToolbar(): HTMLElement | null {
    const byCall =
        document.querySelector('[aria-label="Start Voice Call"]')?.closest('[class*="toolbar"]') as HTMLElement | null ??
        document.querySelector('[aria-label="Start Video Call"]')?.closest('[class*="toolbar"]') as HTMLElement | null ??
        document.querySelector('[aria-label="Search"]')?.closest('[class*="toolbar"]') as HTMLElement | null;

    if (byCall) return byCall;

   
    const header =
        document.querySelector('[class*="chat"] [class*="toolbar"]') as HTMLElement | null ??
        document.querySelector('[class*="channelHeader"] [class*="toolbar"]') as HTMLElement | null ??
        document.querySelector('[class*="header"] [class*="toolbar"]') as HTMLElement | null;

    if (header) return header;

    
    const all = document.querySelectorAll<HTMLElement>('[class*="toolbar"]');
    for (const t of all) {
        if (t.children.length > 3) return t;
    }

    return all[all.length - 1] ?? null;
}

function clearClasses() {
    document.querySelectorAll<HTMLElement>(".vc-dm-hidden, .vc-dm-blur").forEach(el => {
        el.classList.remove("vc-dm-hidden", "vc-dm-blur");
    });
    document.querySelectorAll<HTMLElement>(".vc-hide-sidebar-name").forEach(el => {
        el.classList.remove("vc-hide-sidebar-name");
    });
}


function hideCurrentDm(dmId: string) {
    if (revealedDMs.has(dmId)) return;

    const target = settings.store.hideEntireDm
        ? document.querySelector("main")
        : document.querySelector('[data-list-id="chat-messages"]')?.parentElement;

    if (!target) return;

    (target as HTMLElement).classList.remove("vc-dm-hidden", "vc-dm-blur");
    (target as HTMLElement).classList.add(
        settings.store.blurMode ? "vc-dm-blur" : "vc-dm-hidden"
    );
}


const SVG_EYE = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2.2"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`.trim();

const SVG_EYE_OFF = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2.2"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
           a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
           a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`.trim();

function syncButton(btn: HTMLButtonElement, dmId: string) {
    const revealed = revealedDMs.has(dmId);
    btn.innerHTML  = `${revealed ? SVG_EYE_OFF : SVG_EYE}${revealed ? "Hide DM" : "Reveal DM"}`;
    btn.className  = `vc-dm-btn ${revealed ? "vc-btn-hide" : "vc-btn-reveal"}`;
    btn.title      = revealed
        ? "Click to hide this DM again"
        : "Click to temporarily reveal this DM";
    btn.setAttribute("aria-label", btn.title);
}

function injectButton(dmId: string) {
    const toolbar = findChatToolbar();
    if (!toolbar) return;

    // If button already lives in this exact toolbar, just update it
    let btn = toolbar.querySelector<HTMLButtonElement>(".vc-dm-btn");

    if (!btn) {
        // Wrap in a small container so the flex layout of the toolbar isn't disrupted
        const wrap = document.createElement("div");
        wrap.className = "vc-dm-btn-wrap";

        btn = document.createElement("button");
        btn.onclick = () => {
            revealedDMs.has(dmId)
                ? revealedDMs.delete(dmId)
                : revealedDMs.add(dmId);
            updatePrivacy();
        };

        wrap.appendChild(btn);


        toolbar.insertBefore(wrap, toolbar.firstChild);
    }

    syncButton(btn, dmId);
    revealBtn = btn;
}

function removeRevealButton() {

    const wrap = revealBtn?.closest(".vc-dm-btn-wrap");
    (wrap ?? revealBtn)?.remove();
    revealBtn = null;
}



function updatePrivacy() {
    const sharing = isScreenSharing();

    clearClasses();

    if (!sharing) {
        removeRevealButton();
        revealedDMs.clear();
        return;
    }

    if (!isDm()) {
        removeRevealButton();
        return;
    }

}


export default definePlugin({
    name: "DMScreenPrivacy",
    description:
        "Automatically hide DMs while screen sharing",

    authors: [
        {
            name: "crusader",
            id: 342776697105678346n
        }
    ],

    source: "https://github.com/fake181/DmScreenPrivacy",

    settings,

    start() {
        injectStyles();

        interval = setInterval(() => {
            const shareState  = isScreenSharing();
            const currentPath = window.location.pathname;

            const changed =
                shareState !== lastShareState ||
                currentPath !== lastPath;

            if (!changed) return;

            lastShareState = shareState;
            lastPath       = currentPath;

            updatePrivacy();
        }, 500);

        updatePrivacy();
    },

    stop() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        clearClasses();
        removeRevealButton();
        revealedDMs.clear();

        styleEl?.remove();
        styleEl = null;

        lastPath       = "";
        lastShareState = false;
    }
});
