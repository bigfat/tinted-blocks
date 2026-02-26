
import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	enableBlockTint: boolean;
	blockStartMarker: string;
	blockEndMarker: string;
	defaultColor: string;
	
	enableInlineHighlight: boolean;
	inlineMarker: string;

    enableTableTint: boolean;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	enableBlockTint: true,
	blockStartMarker: '/--',
	blockEndMarker: '--/',
	defaultColor: '#555555',
	
	enableInlineHighlight: true,
	inlineMarker: '::',

    enableTableTint: true,
}

export class TintedBlocksSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

    // Helper to convert short hex (#abc) to long hex (#aabbcc) for color picker
    normalizeHex(color: string): string {
        const c = color.trim();
        if (/^#[0-9A-F]{3}$/i.test(c)) {
            return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
        }
        if (/^#[0-9A-F]{6}$/i.test(c)) {
            return c;
        }
        return c;
    }

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		
		// --- General / Info ---
		containerEl.createEl('h2', {text: 'Tinted Blocks Settings'});

		const helpDesc = document.createDocumentFragment();
		helpDesc.append('You can assign hotkeys to "Tint block" and "Highlight text" commands in ');
        // Use a button-like link that calls the API instead of URI
        const link = helpDesc.createEl('a', {
            text: 'Settings → Hotkeys',
            href: '#',
        });
        link.onclick = (e) => {
            e.preventDefault();
            // Access internal API to open settings tab
            // @ts-ignore
            if (this.app.setting && this.app.setting.openTabById) {
                // @ts-ignore
                this.app.setting.openTabById('hotkeys');
            }
        };
		helpDesc.append('.');
        helpDesc.append(document.createElement('br'));
        helpDesc.append("Default hotkeys: Tint Block (Cmd/Ctrl+Shift+'), Highlight Text (Cmd/Ctrl+Shift+B).");

		new Setting(containerEl)
			.setName('Hotkeys')
			.setDesc(helpDesc);

		// --- Block Tinting Section ---
        this.addBlockTintingSection(containerEl);

		// --- Inline Highlighting Section ---
        this.addInlineHighlightingSection(containerEl);

        // --- Table Cell Tinting Section ---
        this.addTableTintingSection(containerEl);
	}

    addBlockTintingSection(containerEl: HTMLElement) {
        // Section Header with Toggle
        const headerDiv = containerEl.createDiv({ cls: 'tinted-blocks-setting-header' });
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.marginTop = '20px';
        headerDiv.style.marginBottom = '10px';

        const h3 = headerDiv.createEl('h3', { text: 'Block Tinting' });
        h3.style.margin = '0';
        h3.style.fontSize = '1.2em';

        // Toggle Switch directly in header
        const toggleSetting = new Setting(headerDiv)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBlockTint)
                .onChange(async (value) => {
                    this.plugin.settings.enableBlockTint = value;
                    await this.plugin.saveSettings();
                    // Toggle visibility of details
                    if (value) {
                        detailsDiv.style.display = 'block';
                    } else {
                        detailsDiv.style.display = 'none';
                    }
                }));
        // Remove default padding/border from setting to fit in header
        toggleSetting.settingEl.style.border = 'none';
        toggleSetting.settingEl.style.padding = '0';
        
        // Container for detailed settings
        const detailsDiv = containerEl.createDiv();
        if (!this.plugin.settings.enableBlockTint) {
            detailsDiv.style.display = 'none';
        }

		const blockUsageDesc = document.createDocumentFragment();
        blockUsageDesc.append('Wrap content with markers. Syntax:');
        const codeBlock = blockUsageDesc.createEl('div');
        codeBlock.style.backgroundColor = 'var(--background-primary-alt)';
        codeBlock.style.padding = '8px';
        codeBlock.style.borderRadius = '4px';
        codeBlock.style.marginTop = '8px';
        codeBlock.style.fontFamily = 'var(--font-monospace)';
        codeBlock.style.whiteSpace = 'pre';
        codeBlock.setText(`${this.plugin.settings.blockStartMarker}color\nYour text here...\n${this.plugin.settings.blockEndMarker}`);

		const blockUsageSetting = new Setting(detailsDiv)
			.setName('How To Use')
			.setDesc(blockUsageDesc);
        
        // Start/End Marker Logic
        let startMarkerText: any;
        let endMarkerText: any;
        let endMarkerSetting: Setting;

		new Setting(detailsDiv)
			.setName('Block Start Marker')
			.setDesc('The marker that indicates the start of a tinted block.')
			.addText(text => {
                startMarkerText = text;
                text
				.setPlaceholder('/--')
				.setValue(this.plugin.settings.blockStartMarker)
				.onChange(async (value) => {
                    if (!value) {
                        value = DEFAULT_SETTINGS.blockStartMarker;
                    }
					this.plugin.settings.blockStartMarker = value;
                    validateMarkers();
					await this.plugin.saveSettings();
				});
                
                text.inputEl.addEventListener('blur', async () => {
                    if (!this.plugin.settings.blockStartMarker) {
                        this.plugin.settings.blockStartMarker = DEFAULT_SETTINGS.blockStartMarker;
                        text.setValue(DEFAULT_SETTINGS.blockStartMarker);
                        validateMarkers();
                        await this.plugin.saveSettings();
                    }
                });
            });

		endMarkerSetting = new Setting(detailsDiv)
			.setName('Block End Marker')
			.setDesc('The marker that indicates the end of a tinted block.')
			.addText(text => {
                endMarkerText = text;
                text
				.setPlaceholder('--/')
				.setValue(this.plugin.settings.blockEndMarker)
				.onChange(async (value) => {
					this.plugin.settings.blockEndMarker = value;
                    validateMarkers();
					await this.plugin.saveSettings();
				});

                text.inputEl.addEventListener('blur', async () => {
                    if (!this.plugin.settings.blockEndMarker) {
                        this.plugin.settings.blockEndMarker = DEFAULT_SETTINGS.blockEndMarker;
                        text.setValue(DEFAULT_SETTINGS.blockEndMarker);
                        validateMarkers();
                        await this.plugin.saveSettings();
                    }
                });
            });
        
        const validateMarkers = () => {
            const start = this.plugin.settings.blockStartMarker;
            const end = this.plugin.settings.blockEndMarker;
            
            if (start === end && start !== "") {
                const desc = document.createDocumentFragment();
                desc.createEl('span', {text: 'The marker that indicates the end of a tinted block. '});
                const errorEl = desc.createEl('span', {text: 'Error: Start and End markers cannot be the same!', cls: 'text-error'});
                errorEl.style.color = 'var(--text-error)';
                errorEl.style.fontWeight = 'bold';
                endMarkerSetting.setDesc(desc);
            } else {
                endMarkerSetting.setDesc('The marker that indicates the end of a tinted block.');
            }
        };
        
        validateMarkers();
        
        // Color Preview Container
        const colorSetting = new Setting(detailsDiv)
			.setName('Default Block Color')
			.setDesc('The color used when no color is specified or the specified color is invalid.');

        let textComponent: any;
        let colorComponent: any;

        colorSetting.addText(text => {
            textComponent = text;
            text
                .setPlaceholder('#555555')
                .setValue(this.plugin.settings.defaultColor)
                .onChange(async (value) => {
                    this.plugin.settings.defaultColor = value;
                    updatePreview(value);
                    
                    let hexForPicker = value;
                    if (/^#[0-9A-F]{3}$/i.test(value)) {
                        hexForPicker = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
                    }

                    if (/^#[0-9A-F]{6}$/i.test(hexForPicker)) {
                         if (colorComponent) {
                             colorComponent.setValue(hexForPicker);
                             const colorInput = colorSetting.controlEl.querySelector('input[type="color"]') as HTMLInputElement;
                             if (colorInput) {
                                 colorInput.value = hexForPicker;
                             }
                         }
                    }
                    
                    await this.plugin.saveSettings();
                });
        });

        colorSetting.addColorPicker(color => {
            colorComponent = color;
            color
                .setValue(this.normalizeHex(this.plugin.settings.defaultColor))
                .onChange(async (value) => {
                    this.plugin.settings.defaultColor = value;
                    if (textComponent) textComponent.setValue(value);
                    updatePreview(value);
                    await this.plugin.saveSettings();
                });
        });
        
        const previewEl = detailsDiv.createDiv();
        previewEl.style.marginTop = '10px';
        previewEl.style.marginBottom = '20px';
        previewEl.style.paddingTop = '12px';
        previewEl.style.paddingBottom = '12px';
        previewEl.style.borderRadius = '8px';
        previewEl.addClass('tinted-block');
        previewEl.style.setProperty('--tint-color', this.plugin.settings.defaultColor);
        previewEl.createEl('div', { text: 'This is a preview of the default color block.', cls: '' });
        previewEl.createEl('div', { text: 'It shows how text and background look.', cls: '' });

        const updatePreview = (color: string) => {
            previewEl.style.setProperty('--tint-color', color);
        };
    }

    addInlineHighlightingSection(containerEl: HTMLElement) {
        // Section Header with Toggle
        const headerDiv = containerEl.createDiv({ cls: 'tinted-blocks-setting-header' });
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.marginTop = '20px';
        headerDiv.style.marginBottom = '10px';

        const h3 = headerDiv.createEl('h3', { text: 'Inline Highlighting' });
        h3.style.margin = '0';
        h3.style.fontSize = '1.2em';

        // Toggle Switch
        const toggleSetting = new Setting(headerDiv)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInlineHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableInlineHighlight = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        detailsDiv.style.display = 'block';
                    } else {
                        detailsDiv.style.display = 'none';
                    }
                }));
        toggleSetting.settingEl.style.border = 'none';
        toggleSetting.settingEl.style.padding = '0';

        // Details Container
        const detailsDiv = containerEl.createDiv();
        if (!this.plugin.settings.enableInlineHighlight) {
            detailsDiv.style.display = 'none';
        }

        const inlineUsageDesc = document.createDocumentFragment();
        inlineUsageDesc.append('Highlight text inline. Syntax: ');
        inlineUsageDesc.createEl('code', {text: `${this.plugin.settings.inlineMarker}text${this.plugin.settings.inlineMarker}`});
        inlineUsageDesc.append(' or ');
        inlineUsageDesc.createEl('code', {text: `${this.plugin.settings.inlineMarker}red:text${this.plugin.settings.inlineMarker}`});

		const inlineUsageSetting = new Setting(detailsDiv)
			.setName('How To Use')
			.setDesc(inlineUsageDesc);

		new Setting(detailsDiv)
			.setName('Inline Marker')
			.setDesc('The marker used for inline highlighting (e.g., ::text::).')
			.addText(text => text
				.setPlaceholder('::')
				.setValue(this.plugin.settings.inlineMarker)
				.onChange(async (value) => {
					this.plugin.settings.inlineMarker = value;
					await this.plugin.saveSettings();
				}));
    }

    addTableTintingSection(containerEl: HTMLElement) {
        // Section Header with Toggle
        const headerDiv = containerEl.createDiv({ cls: 'tinted-blocks-setting-header' });
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.marginTop = '20px';
        headerDiv.style.marginBottom = '10px';

        const h3 = headerDiv.createEl('h3', { text: 'Table Cell Tinting' });
        h3.style.margin = '0';
        h3.style.fontSize = '1.2em';

        // Toggle Switch
        const toggleSetting = new Setting(headerDiv)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTableTint)
                .onChange(async (value) => {
                    this.plugin.settings.enableTableTint = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        detailsDiv.style.display = 'block';
                    } else {
                        detailsDiv.style.display = 'none';
                    }
                }));
        toggleSetting.settingEl.style.border = 'none';
        toggleSetting.settingEl.style.padding = '0';

        // Details Container
        const detailsDiv = containerEl.createDiv();
        if (!this.plugin.settings.enableTableTint) {
            detailsDiv.style.display = 'none';
        }

        const tableDesc = document.createDocumentFragment();
        tableDesc.append('Add color to table cells. Syntax: ');
        tableDesc.createEl('code', {text: '| :r: Content |'});
        tableDesc.append(document.createElement('br'));
        const alphaWarning = tableDesc.createEl('span', {text: '⚠️ Alpha Feature: This feature relies on internal Obsidian DOM structures and may break with future updates.', cls: 'text-error'});
        alphaWarning.style.color = 'var(--text-warning)';
        alphaWarning.style.fontSize = '0.9em';
        alphaWarning.style.display = 'block';
        alphaWarning.style.marginTop = '5px';

		const tableUsageSetting = new Setting(detailsDiv)
			.setName('How To Use')
			.setDesc(tableDesc);
    }
}
