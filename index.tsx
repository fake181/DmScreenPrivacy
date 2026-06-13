import definePlugin from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

const settings = definePluginSettings({
    hideSidebarNames: {
        type: OptionType.BOOLEAN,
        description: "Hide DM names in sidebar while screen sharing",
        default: false
    },

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

let styleEl: HTMLStyleElement | null = null;
let interval: number | null = null;
let revealBtn: HTMLButtonElement | null = null;

const revealedDMs = new Set<string>();
let lastPath = "";
let lastShareState = false;

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
            filter: blur(12px) !important;
            pointer-events: none !important;
            user-select: none !important;
        }

        .vc-hide-sidebar-name {
            color: transparent !important;
        }

        .vc-dm-btn {
            margin-left: 10px;
            border: none;
            border-radius: 8px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: 12px;
            background: var(--brand-experiment);
            color: white;
            z-index: 9999;
        }

        .vc-dm-btn:hover {
            opacity: .9;
        }
    `;

    document.head.appendChild(styleEl);
}

function isScreenSharing(): boolean {
    return !!document.querySelector(
        '[aria-label*="Stop Streaming"], [aria-label*="Stop Sharing"]'
    );
}

function getCurrentDmId(): string | null {
    const match = window.location.pathname.match(
        /\/channels\/@me\/(\d+)/
    );

    return match?.[1] ?? null;
}

function isDm(): boolean {
    return (
        window.location.pathname.startsWith("/channels/@me/")
        && getCurrentDmId() !== null
    );
}

function clearClasses() {
    document.querySelectorAll(".vc-dm-hidden")
        .forEach(el => el.classList.remove("vc-dm-hidden"));

    document.querySelectorAll(".vc-dm-blur")
        .forEach(el => el.classList.remove("vc-dm-blur"));

    document.querySelectorAll(".vc-hide-sidebar-name")
        .forEach(el => el.classList.remove("vc-hide-sidebar-name"));
}

function injectButton(dmId: string) {
    const toolbar =
        document.querySelector('[aria-label="Start Voice Call"]')
            ?.parentElement
        || document.querySelector('[class*="toolbar"]')
        || document.querySelector("header");

    if (!toolbar) return;

    let btn = document.querySelector(
        ".vc-dm-btn"
    ) as HTMLButtonElement | null;

    if (!btn) {
        btn = document.createElement("button");
        btn.className = "vc-dm-btn";

        btn.style.height = "32px";
        btn.style.padding = "0 12px";
        btn.style.marginLeft = "8px";
        btn.style.borderRadius = "8px";
        btn.style.whiteSpace = "nowrap";
        btn.style.flexShrink = "0";

        btn.onclick = () => {
            if (revealedDMs.has(dmId)) {
                revealedDMs.delete(dmId);
            } else {
                revealedDMs.add(dmId);
            }

            updatePrivacy();
        };

        toolbar.appendChild(btn);
    }

    btn.textContent =
        revealedDMs.has(dmId)
            ? "Hide DM"
            : "Reveal DM";

    revealBtn = btn;
}

function hideSidebarNames() {
    if (!settings.store.hideSidebarNames) return;

    document.querySelectorAll('[class*="name"]')
        .forEach(el => {
            el.classList.add("vc-hide-sidebar-name");
        });
}

function hideCurrentDm(dmId: string) {
    if (revealedDMs.has(dmId)) return;

    const target = settings.store.hideEntireDm
        ? document.querySelector("main")
        : (
            document.querySelector(
                '[data-list-id="chat-messages"]'
            )?.parentElement
        );

    if (!target) return;

    target.classList.remove(
        "vc-dm-hidden",
        "vc-dm-blur"
    );

    target.classList.add(
        settings.store.blurMode
            ? "vc-dm-blur"
            : "vc-dm-hidden"
    );
}

function removeRevealButton() {
    revealBtn?.remove();
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

    hideSidebarNames();

    const dmId = getCurrentDmId();
    if (!dmId) return;

    injectButton(dmId);
    hideCurrentDm(dmId);
}

export default definePlugin({
    name: "DMScreenPrivacy",
    description:
        "Automatically hide DMs while screen sharing / يخفي الخاص تلقائياً عند فتحك للسكرين / made by crusader ",

    authors: [
        {
            name: "crusader",
            id: 342776697105678346n
        }
    ],

    settings,

    start() {
        injectStyles();

        interval = window.setInterval(() => {
            const shareState = isScreenSharing();
            const currentPath = window.location.pathname;

            const changed =
                shareState !== lastShareState
                || currentPath !== lastPath;

            if (!changed) return;

            lastShareState = shareState;
            lastPath = currentPath;

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
    }
});