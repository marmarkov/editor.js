//MarkDescriptionInlineTool

import SelectionUtils from '../selection';

import $ from '../dom';
import { API, InlineTool, SanitizerConfig } from '../../../types';
import { Notifier, Toolbar, I18n } from '../../../types/api';

export default class MarkDescriptionInlineTool implements InlineTool {
  public static isInline = true;
  public static title = 'MarkDescription';
  private range: Range;

  public static get sanitize(): SanitizerConfig {
    return {
      mark: {
        'data-body': true,
      },
    } as SanitizerConfig;
  }

  private readonly commandLink: string = 'linkMarkDescription';
  private readonly commandUnlink: string = 'unlinkMarkDescription';

  private readonly ENTER_KEY: number = 13;

  private readonly CSS = {
    button: 'ce-inline-tool',
    buttonActive: 'ce-inline-tool--active',
    buttonModifier: 'ce-inline-tool--link',
    buttonUnlink: 'ce-inline-tool--unlink',
    input: 'ce-inline-tool-input',
    inputShowed: 'ce-inline-tool-input--showed',
  };

  private nodes: {
    button: HTMLButtonElement;
    input: HTMLInputElement;
  } = {
    button: null,
    input: null,
  };

  /**
   * SelectionUtils instance
   */
  private selection: SelectionUtils;

  /**
   * Input opening state
   */
  private inputOpened = false;

  /**
   * Available Toolbar methods (open/close)
   */
  private toolbar: Toolbar;

  /**
   * Available inline toolbar methods (open/close)
   */
  private inlineToolbar: Toolbar;

  /**
   * Notifier API methods
   */
  private notifier: Notifier;

  /**
   * I18n API
   */
  private i18n: I18n;

  /**
   * @param {API} api - Editor.js API
   */
  constructor({ api }) {
    this.toolbar = api.toolbar;
    this.inlineToolbar = api.inlineToolbar;
    this.notifier = api.notifier;
    this.i18n = api.i18n;
    this.selection = new SelectionUtils();
    this.range = null;
  }

  /**
   * Create button for Inline Toolbar
   */
  public render(): HTMLElement {
    this.nodes.button = document.createElement('button') as HTMLButtonElement;
    this.nodes.button.type = 'button';
    this.nodes.button.classList.add(this.CSS.button, this.CSS.buttonModifier);
    this.nodes.button.appendChild($.svg('link', 14, 10));
    this.nodes.button.appendChild($.svg('unlink', 15, 11));

    return this.nodes.button;
  }

  /**
   * Input for the link
   */
  public renderActions(): HTMLElement {
    this.nodes.input = document.createElement('TEXTAREA') as HTMLInputElement;
    this.nodes.input.placeholder = this.i18n.t('Add a description');
    this.nodes.input.classList.add(this.CSS.input);
    this.nodes.input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.keyCode === this.ENTER_KEY) {
        this.enterPressed(event);
      }
    });

    return this.nodes.input;
  }

  public surround(range: Range): void {
    if (!range) {
      return;
    }



    /**
     * If start or end of selection is in the highlighted block
     */
    if (range) {
      this.range = range;
      if (!this.inputOpened) {
        this.selection.setFakeBackground();
        this.selection.save();
      } else {
        this.selection.restore();
        this.selection.removeFakeBackground();
      }

      const parentAnchor = this.selection.findParentTag('MARK');


      if (parentAnchor) {
        this.selection.expandToTag(parentAnchor);
        this.unlink();
        this.closeActions();
        this.checkState();
        this.toolbar.close();

        return;
      }
    }

    this.toggleActions();
  }

  public checkState(selection?: Selection): boolean {
    const anchorTag = this.selection.findParentTag('MARK');

    if (anchorTag) {
      this.nodes.button.classList.add(this.CSS.buttonUnlink);
      this.nodes.button.classList.add(this.CSS.buttonActive);
      this.openActions();

      /**
       * Fill input value with link href
       */
      const dataAttr = anchorTag.getAttribute('data-body');

      this.nodes.input.value = dataAttr !== 'null' ? dataAttr : '';

      this.selection.save();
    } else {
      this.nodes.button.classList.remove(this.CSS.buttonUnlink);
      this.nodes.button.classList.remove(this.CSS.buttonActive);
    }

    return !!anchorTag;
  }

  /**
   * Function called with Inline Toolbar closing
   */
  public clear(): void {
    this.closeActions();
  }

  /**
   * Set a shortcut
   */
  public get shortcut(): string {
    return 'CMD+K';
  }

  /**
   * Show/close link input
   */
  private toggleActions(): void {
    if (!this.inputOpened) {
      this.openActions(true);
    } else {
      this.closeActions(false);
    }
  }

  /**
   * @param {boolean} needFocus - on link creation we need to focus input. On editing - nope.
   */
  private openActions(needFocus = false): void {
    this.nodes.input.classList.add(this.CSS.inputShowed);
    if (needFocus) {
      this.nodes.input.focus();
    }
    this.inputOpened = true;
  }

  /**
   * Close input
   *
   * @param {boolean} clearSavedSelection — we don't need to clear saved selection
   *                                        on toggle-clicks on the icon of opened Toolbar
   */
  private closeActions(clearSavedSelection = true): void {
    if (this.selection.isFakeBackgroundEnabled) {
      // if actions is broken by other selection We need to save new selection
      const currentSelection = new SelectionUtils();

      currentSelection.save();

      this.selection.restore();
      this.selection.removeFakeBackground();

      // and recover new selection after removing fake background
      currentSelection.restore();
    }

    this.nodes.input.classList.remove(this.CSS.inputShowed);
    this.nodes.input.value = '';
    if (clearSavedSelection) {
      this.selection.clearSaved();
    }
    this.inputOpened = false;
  }

  /**
   * Enter pressed on input
   *
   * @param {KeyboardEvent} event - enter keydown event
   */
  private enterPressed(event: KeyboardEvent): void {
    let value = this.nodes.input.value || '';

    if (!value.trim()) {
      this.selection.restore();
      this.unlink();
      event.preventDefault();
      this.closeActions();
    }

    this.selection.restore();
    this.selection.removeFakeBackground();

    this.insertLink(value);

    /**
     * Preventing events that will be able to happen
     */
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.selection.collapseToEnd();
    this.inlineToolbar.close();
  }


  /**
   * Inserts <a> tag with "href"
   *
   * @param {string} link - "href" value
   */
  private insertLink(link: string): void {
    const anchorTag = this.selection.findParentTag('MARK');


    //
    if (anchorTag) {

      anchorTag.setAttribute('data-body', link);

      this.selection.expandToTag(anchorTag);

      return;
    }

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);

    let marker = document.createElement('MARK');

    marker.setAttribute('data-body', link);

    //  marker.classList.add(Marker.CSS);

    marker.appendChild(range.extractContents());
    range.insertNode(marker);

    /**
     * Expand (add) selection to highlighted block
     */
    this.selection.expandToTag(marker);





    // const anchorTag = this.selection.findParentTag('MARK');


    // //
    // if (anchorTag) {
    //   this.selection.expandToTag(anchorTag);
    // }

   // anchorTag.setAttribute('data-body', link);


    //
  //   document.execCommand('formatBlock', false, '<span>');
  }

  /**
   * Removes <a> tag
   */
  private unlink(): void {
    let termWrapper = this.selection.findParentTag('MARK');
    this.selection.expandToTag(termWrapper);

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);

    let unwrappedContent = range.extractContents();

    /**
     * Remove empty term-tag
     */
    termWrapper.parentNode.removeChild(termWrapper);

    /**
     * Insert extracted content
     */
    range.insertNode(unwrappedContent);

    /**
     * Restore selection
     */
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
