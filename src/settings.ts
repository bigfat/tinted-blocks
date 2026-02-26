import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	enableBlockHighlight: boolean;
	blockStartMarker: string;
	blockEndMarker: string;
	defaultColor: string;
	
	enableInlineHighlight: boolean;
	inlineMarker: string;

    enableTableTint: boolean;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	enableBlockHighlight: true,
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

		// --- Block Highlighting Section ---
		containerEl.createEl('h3', {text: 'Block Tinting'});

		new Setting(containerEl)
			.setName('Enable Block Tinting')
			.setDesc('Toggle the block tinting feature (syntax: ::>color ... <::).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBlockHighlight)
				.onChange(async (value) => {
					this.plugin.settings.enableBlockHighlight = value;
					await this.plugin.saveSettings();
					// Force refresh handled by saveSettings in main.ts
				}));
        
        // Start/End Marker Logic
        let startMarkerText: any;
        let endMarkerText: any;
        let endMarkerSetting: Setting;

		new Setting(containerEl)
			.setName('Block Start Marker')
			.setDesc('The marker that indicates the start of a tinted block.')
			.addText(text => {
                startMarkerText = text;
                text
				.setPlaceholder('/--')
				.setValue(this.plugin.settings.blockStartMarker)
				.onChange(async (value) => {
                    // Reset to default if empty
                    if (!value) {
                        value = DEFAULT_SETTINGS.blockStartMarker;
                        // We will update the value after focus lost if possible, or just save it.
                        // But user might be typing. 
                        // Requirement: "if user clears input... default value on blur"
                        // TextComponent doesn't expose onBlur easily in chaining.
                        // We'll handle empty check on save.
                    }
                    
					this.plugin.settings.blockStartMarker = value;
                    validateMarkers();
					await this.plugin.saveSettings();
				});
                
                // Hack to add blur listener
                text.inputEl.addEventListener('blur', async () => {
                    if (!this.plugin.settings.blockStartMarker) {
                        this.plugin.settings.blockStartMarker = DEFAULT_SETTINGS.blockStartMarker;
                        text.setValue(DEFAULT_SETTINGS.blockStartMarker);
                        validateMarkers();
                        await this.plugin.saveSettings();
                    }
                });
            });

		endMarkerSetting = new Setting(containerEl)
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

                // Hack to add blur listener
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
        
        // Initial validation
        validateMarkers();
        
        // Color Preview Container
        const colorSetting = new Setting(containerEl)
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
        
        const previewEl = containerEl.createDiv();
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

		// --- Inline Highlighting Section ---
		containerEl.createEl('h3', {text: 'Inline Highlighting'});

		new Setting(containerEl)
			.setName('Enable Inline Highlighting')
			.setDesc('Toggle the inline highlighting feature (syntax: ::text::).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableInlineHighlight)
				.onChange(async (value) => {
					this.plugin.settings.enableInlineHighlight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Inline Marker')
			.setDesc('The marker used for inline highlighting (e.g., ::text::).')
			.addText(text => text
				.setPlaceholder('::')
				.setValue(this.plugin.settings.inlineMarker)
				.onChange(async (value) => {
					this.plugin.settings.inlineMarker = value;
					await this.plugin.saveSettings();
				}));

        // --- Table Cell Tinting Section ---
		containerEl.createEl('h3', {text: 'Table Cell Tinting'});

		new Setting(containerEl)
			.setName('Enable Table Cell Tinting')
			.setDesc('Toggle the table cell tinting feature (syntax: | :c: content |).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTableTint)
				.onChange(async (value) => {
					this.plugin.settings.enableTableTint = value;
					await this.plugin.saveSettings();
				}));
	}
}
