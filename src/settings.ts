import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	blockStartMarker: string;
	blockEndMarker: string;
	inlineMarker: string;
	defaultColor: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	blockStartMarker: '::>',
	blockEndMarker: '<::',
	inlineMarker: '::',
	defaultColor: '#555555'
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
        // Fallback to black if invalid for color picker (browser default)
        // Or keep original if it might be valid (though input[type=color] is strict)
        return c;
    }

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Block Start Marker')
			.setDesc('The marker that indicates the start of a highlighted block.')
			.addText(text => text
				.setPlaceholder('::>')
				.setValue(this.plugin.settings.blockStartMarker)
				.onChange(async (value) => {
					this.plugin.settings.blockStartMarker = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Block End Marker')
			.setDesc('The marker that indicates the end of a highlighted block.')
			.addText(text => text
				.setPlaceholder('<::')
				.setValue(this.plugin.settings.blockEndMarker)
				.onChange(async (value) => {
					this.plugin.settings.blockEndMarker = value;
					await this.plugin.saveSettings();
				}));
        
        // Color Preview Container
        const colorSetting = new Setting(containerEl)
			.setName('Default Block Color')
			.setDesc('The color used when no color is specified or the specified color is invalid.');

        // 1. Text Input for Color (Hex, Name, RGB)
        let textComponent: any;
        // We also need reference to the color picker component to update it
        let colorComponent: any;

        colorSetting.addText(text => {
            textComponent = text;
            text
                .setPlaceholder('#555555')
                .setValue(this.plugin.settings.defaultColor)
                .onChange(async (value) => {
                    this.plugin.settings.defaultColor = value;
                    updatePreview(value);
                    
                    // Update Color Picker value if it's a valid hex
                    // HTML color input only accepts 6-digit hex codes (e.g. #aabbcc)
                    // We handle short hex too by normalizing
                    let hexForPicker = value;
                    if (/^#[0-9A-F]{3}$/i.test(value)) {
                        hexForPicker = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
                    }

                    if (/^#[0-9A-F]{6}$/i.test(hexForPicker)) {
                         if (colorComponent) {
                             colorComponent.setValue(hexForPicker);
                             
                             // Force DOM update if setValue doesn't trigger it immediately
                             // Access the underlying input element if exposed or find it
                             // Obsidian's ColorComponent usually updates its internal state and value
                             // but maybe we need to be explicit.
                             // Actually, let's try to find the input element within the colorSetting container
                             // and update it directly to be sure.
                             const colorInput = colorSetting.controlEl.querySelector('input[type="color"]') as HTMLInputElement;
                             if (colorInput) {
                                 colorInput.value = hexForPicker;
                             }
                         }
                    }
                    
                    await this.plugin.saveSettings();
                });
        });

        // 2. Color Picker (Syncs with Text Input)
        colorSetting.addColorPicker(color => {
            colorComponent = color;
            // Use normalized hex for the color picker value
            color
                .setValue(this.normalizeHex(this.plugin.settings.defaultColor))
                .onChange(async (value) => {
                    this.plugin.settings.defaultColor = value;
                    // Update Text Input value
                    if (textComponent) textComponent.setValue(value);
                    updatePreview(value);
                    await this.plugin.saveSettings();
                });
        });
        
        // 3. Live Preview Block
        const previewEl = containerEl.createDiv();
        previewEl.style.marginTop = '10px';
        previewEl.style.marginBottom = '20px';
        
        // Add manual padding and border radius for the settings preview
        // because the real plugin uses separate start/end line classes for vertical padding/radius.
        // Here we just want a simple block.
        previewEl.style.paddingTop = '12px';
        previewEl.style.paddingBottom = '12px';
        previewEl.style.borderRadius = '8px';
        
        previewEl.addClass('tinted-block'); // Use our plugin's class!
        // We need to manually apply the style because .tinted-block relies on --tint-color
        previewEl.style.setProperty('--tint-color', this.plugin.settings.defaultColor);
        
        // Add some dummy content
        previewEl.createEl('div', { text: 'This is a preview of the default color block.', cls: '' });
        previewEl.createEl('div', { text: 'It shows how text and background look.', cls: '' });

        // Helper to update preview
        const updatePreview = (color: string) => {
            previewEl.style.setProperty('--tint-color', color);
        };

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
	}
}
