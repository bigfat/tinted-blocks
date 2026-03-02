Thank you for your submission, an automated scan of your plugin code's revealed the following issues:

### Required

[[1]](https://github.com/bigfat/tinted-blocks/blob/dd7110a8e648f16a099ccf1c5129b4e70da2ef09/src/block-tint.ts#L207-L207)  
This assertion is unnecessary since it does not change the type of the expression.

[[1]](https://github.com/bigfat/tinted-blocks/blob/dd7110a8e648f16a099ccf1c5129b4e70da2ef09/src/settings.ts#L142-L149)[[2]](https://github.com/bigfat/tinted-blocks/blob/dd7110a8e648f16a099ccf1c5129b4e70da2ef09/src/settings.ts#L165-L172)  
Promise returned in function argument where a void return was expected.

[[1]](https://github.com/bigfat/tinted-blocks/blob/dd7110a8e648f16a099ccf1c5129b4e70da2ef09/src/settings.ts#L327-L327)  
Unexpected undescribed directive comment. Include descriptions to explain why the comment is necessary.

[[1]](https://github.com/bigfat/tinted-blocks/blob/dd7110a8e648f16a099ccf1c5129b4e70da2ef09/src/settings.ts#L327-L327)  
Disabling 'obsidianmd/ui/sentence-case' is not allowed.

---

### Optional

---

Do **NOT** open a new PR for re-validation.  
Once you have pushed some changes to your repository the bot will rescan within 6 hours  
If you think some of the required changes are incorrect, please comment with `/skip` and the reason why you think the results are incorrect.  
To run these checks locally, install the [eslint plugin](https://github.com/obsidianmd/eslint-plugin) in your project.  
Do **NOT** rebase this PR, this will be handled by the reviewer once the plugin has been approved.