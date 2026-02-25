import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	blockStartMarker: string;
	blockEndMarker: string;
	inlineMarker: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	blockStartMarker: '::>',
	blockEndMarker: '<::',
	inlineMarker: '::'
}

export class TintedBlocksSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
