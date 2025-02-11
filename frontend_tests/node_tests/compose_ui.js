"use strict";

const {strict: assert} = require("assert");

const autosize = require("autosize");

const {$t} = require("../zjsunit/i18n");
const {mock_esm, set_global, zrequire} = require("../zjsunit/namespace");
const {run_test} = require("../zjsunit/test");
const $ = require("../zjsunit/zjquery");

set_global("document", {
    execCommand() {
        return false;
    },
});

mock_esm("../../static/js/message_lists", {
    current: {},
});

const compose_ui = zrequire("compose_ui");
const people = zrequire("people");
const user_status = zrequire("user_status");
const hash_util = mock_esm("../../static/js/hash_util");
const channel = mock_esm("../../static/js/channel");
const compose_actions = zrequire("compose_actions");
const message_lists = zrequire("message_lists");

const alice = {
    email: "alice@zulip.com",
    user_id: 101,
    full_name: "Alice",
};
const bob = {
    email: "bob@zulip.com",
    user_id: 102,
    full_name: "Bob",
};

people.add_active_user(alice);
people.add_active_user(bob);

function make_textbox(s) {
    // Simulate a jQuery textbox for testing purposes.
    const widget = {};

    widget.s = s;
    widget.focused = false;

    widget.caret = function (arg) {
        if (typeof arg === "number") {
            widget.pos = arg;
            return this;
        }

        if (arg) {
            widget.insert_pos = widget.pos;
            widget.insert_text = arg;
            const before = widget.s.slice(0, widget.pos);
            const after = widget.s.slice(widget.pos);
            widget.s = before + arg + after;
            widget.pos += arg.length;
            return this;
        }

        return widget.pos;
    };

    widget.val = function (new_val) {
        if (new_val) {
            widget.s = new_val;
            return this;
        }
        return widget.s;
    };

    widget.trigger = function (type) {
        if (type === "focus") {
            widget.focused = true;
        } else if (type === "blur") {
            widget.focused = false;
        }
        return this;
    };

    return widget;
}

run_test("autosize_textarea", ({override}) => {
    const textarea_autosized = {};

    override(autosize, "update", (textarea) => {
        textarea_autosized.textarea = textarea;
        textarea_autosized.autosized = true;
    });

    // Call autosize_textarea with an argument
    const container = "container-stub";
    compose_ui.autosize_textarea(container);
    assert.equal(textarea_autosized.textarea, container);
    assert.ok(textarea_autosized.autosized);
});

run_test("insert_syntax_and_focus", () => {
    $("#compose-textarea").val("xyz ");
    $("#compose-textarea").caret = function (syntax) {
        if (syntax !== undefined) {
            $("#compose-textarea").val($("#compose-textarea").val() + syntax);
            return this;
        }
        return 4;
    };
    compose_ui.insert_syntax_and_focus(":octopus:");
    assert.equal($("#compose-textarea").caret(), 4);
    assert.equal($("#compose-textarea").val(), "xyz :octopus: ");
    assert.ok($("#compose-textarea").is_focused());
});

run_test("smart_insert", () => {
    let textbox = make_textbox("abc");
    textbox.caret(4);

    compose_ui.smart_insert(textbox, ":smile:");
    assert.equal(textbox.insert_pos, 4);
    assert.equal(textbox.insert_text, " :smile: ");
    assert.equal(textbox.val(), "abc :smile: ");
    assert.ok(textbox.focused);

    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, ":airplane:");
    assert.equal(textbox.insert_text, ":airplane: ");
    assert.equal(textbox.val(), "abc :smile: :airplane: ");
    assert.ok(textbox.focused);

    textbox.caret(0);
    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, ":octopus:");
    assert.equal(textbox.insert_text, ":octopus: ");
    assert.equal(textbox.val(), ":octopus: abc :smile: :airplane: ");
    assert.ok(textbox.focused);

    textbox.caret(textbox.val().length);
    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, ":heart:");
    assert.equal(textbox.insert_text, ":heart: ");
    assert.equal(textbox.val(), ":octopus: abc :smile: :airplane: :heart: ");
    assert.ok(textbox.focused);

    // Test handling of spaces for ```quote
    textbox = make_textbox("");
    textbox.caret(0);
    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, "```quote\nquoted message\n```\n");
    assert.equal(textbox.insert_text, "```quote\nquoted message\n```\n");
    assert.equal(textbox.val(), "```quote\nquoted message\n```\n");
    assert.ok(textbox.focused);

    textbox = make_textbox("");
    textbox.caret(0);
    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, "[Quoting…]\n");
    assert.equal(textbox.insert_text, "[Quoting…]\n");
    assert.equal(textbox.val(), "[Quoting…]\n");
    assert.ok(textbox.focused);

    textbox = make_textbox("abc");
    textbox.caret(3);
    textbox.trigger("blur");
    compose_ui.smart_insert(textbox, " test with space");
    assert.equal(textbox.insert_text, " test with space ");
    assert.equal(textbox.val(), "abc test with space ");
    assert.ok(textbox.focused);

    // Note that we don't have any special logic for strings that are
    // already surrounded by spaces, since we are usually inserting things
    // like emojis and file links.
});

run_test("replace_syntax", () => {
    $("#compose-textarea").val("abcabc");

    compose_ui.replace_syntax("a", "A");
    assert.equal($("#compose-textarea").val(), "Abcabc");

    compose_ui.replace_syntax(/b/g, "B");
    assert.equal($("#compose-textarea").val(), "ABcaBc");

    // Verify we correctly handle `$`s in the replacement syntax
    compose_ui.replace_syntax("Bca", "$$\\pi$$");
    assert.equal($("#compose-textarea").val(), "A$$\\pi$$Bc");
});

run_test("compute_placeholder_text", () => {
    let opts = {
        message_type: "stream",
        stream: "",
        topic: "",
        private_message_recipient: "",
    };

    // Stream narrows
    assert.equal(
        compose_ui.compute_placeholder_text(opts),
        $t({defaultMessage: "Compose your message here"}),
    );

    opts.stream = "all";
    assert.equal(compose_ui.compute_placeholder_text(opts), $t({defaultMessage: "Message #all"}));

    opts.topic = "Test";
    assert.equal(
        compose_ui.compute_placeholder_text(opts),
        $t({defaultMessage: "Message #all > Test"}),
    );

    // PM Narrows
    opts = {
        message_type: "private",
        stream: "",
        topic: "",
        private_message_recipient: "",
    };
    assert.equal(
        compose_ui.compute_placeholder_text(opts),
        $t({defaultMessage: "Compose your message here"}),
    );

    opts.private_message_recipient = "bob@zulip.com";
    user_status.set_status_text({
        user_id: bob.user_id,
        status_text: "out to lunch",
    });
    assert.equal(
        compose_ui.compute_placeholder_text(opts),
        $t({defaultMessage: "Message Bob (out to lunch)"}),
    );

    opts.private_message_recipient = "alice@zulip.com";
    user_status.set_status_text({
        user_id: alice.user_id,
        status_text: "",
    });
    assert.equal(compose_ui.compute_placeholder_text(opts), $t({defaultMessage: "Message Alice"}));

    // Group PM
    opts.private_message_recipient = "alice@zulip.com,bob@zulip.com";
    assert.equal(
        compose_ui.compute_placeholder_text(opts),
        $t({defaultMessage: "Message Alice, Bob"}),
    );
});

run_test("quote_and_reply", ({override}) => {
    const selected_message = {
        type: "stream",
        stream: "devel",
        topic: "python",
        sender_full_name: "Steve Stephenson",
        sender_id: 90,
    };

    override(
        hash_util,
        "by_conversation_and_time_uri",
        () => "https://chat.zulip.org/#narrow/stream/92-learning/topic/Tornado",
    );

    override(message_lists.current, "selected_message", () => selected_message);
    override(message_lists.current, "selected_id", () => 100);

    let success_function;
    override(channel, "get", (opts) => {
        success_function = opts.success;
    });

    // zjquery does not simulate caret handling, so we provide
    // our own versions of val() and caret()
    let textarea_val = "";
    let textarea_caret_pos;

    $("#compose-textarea").val = function (...args) {
        if (args.length === 0) {
            return textarea_val;
        }

        textarea_val = args[0];
        textarea_caret_pos = textarea_val.length;

        return this;
    };

    $("#compose-textarea").caret = function (arg) {
        if (arg === undefined) {
            return textarea_caret_pos;
        }
        if (typeof arg === "number") {
            textarea_caret_pos = arg;
            return this;
        }
        if (typeof arg !== "string") {
            console.info(arg);
            throw new Error("We expected the actual code to pass in a string.");
        }

        const before = textarea_val.slice(0, textarea_caret_pos);
        const after = textarea_val.slice(textarea_caret_pos);

        textarea_val = before + arg + after;
        textarea_caret_pos += arg.length;
        return this;
    };

    function set_compose_content_with_caret(content) {
        const caret_position = content.indexOf("%");
        content = content.slice(0, caret_position) + content.slice(caret_position + 1); // remove the "%"
        textarea_val = content;
        textarea_caret_pos = caret_position;
        $("#compose-textarea").trigger("focus");
    }

    function get_compose_content_with_caret() {
        const content =
            textarea_val.slice(0, textarea_caret_pos) +
            "%" +
            textarea_val.slice(textarea_caret_pos); // insert the "%"
        return content;
    }

    function reset_test_state() {
        // Reset `raw_content` property of `selected_message`.
        delete selected_message.raw_content;

        // Reset compose-box state.
        textarea_val = "";
        textarea_caret_pos = 0;
        $("#compose-textarea").trigger("blur");
    }

    set_compose_content_with_caret("hello %there"); // "%" is used to encode/display position of focus before change
    compose_actions.quote_and_reply();
    assert.equal(get_compose_content_with_caret(), "hello \n[Quoting…]\n%there");

    success_function({
        raw_content: "Testing caret position",
    });
    assert.equal(
        get_compose_content_with_caret(),
        "hello \ntranslated: @_**Steve Stephenson|90** [said](https://chat.zulip.org/#narrow/stream/92-learning/topic/Tornado):\n```quote\nTesting caret position\n```\n%there",
    );

    reset_test_state();

    // If the caret is initially positioned at 0, it should not
    // add a newline before the quoted message.
    set_compose_content_with_caret("%hello there");
    compose_actions.quote_and_reply();
    assert.equal(get_compose_content_with_caret(), "[Quoting…]\n%hello there");

    success_function({
        raw_content: "Testing with caret initially positioned at 0.",
    });
    assert.equal(
        get_compose_content_with_caret(),
        "translated: @_**Steve Stephenson|90** [said](https://chat.zulip.org/#narrow/stream/92-learning/topic/Tornado):\n```quote\nTesting with caret initially positioned at 0.\n```\n%hello there",
    );

    override(compose_actions, "respond_to_message", () => {
        // Reset compose state to replicate the re-opening of compose-box.
        textarea_val = "";
        textarea_caret_pos = 0;
        $("#compose-textarea").trigger("focus");
    });

    reset_test_state();

    // If the compose-box is close, or open with no content while
    // quoting a message, the quoted message should be placed
    // at the beginning of compose-box.
    compose_actions.quote_and_reply();
    assert.equal(get_compose_content_with_caret(), "[Quoting…]\n%");

    success_function({
        raw_content: "Testing with compose-box closed initially.",
    });
    assert.equal(
        get_compose_content_with_caret(),
        "translated: @_**Steve Stephenson|90** [said](https://chat.zulip.org/#narrow/stream/92-learning/topic/Tornado):\n```quote\nTesting with compose-box closed initially.\n```\n%",
    );

    reset_test_state();

    // If the compose-box is already open while quoting a message,
    // but contains content like `\n\n  \n` (only whitespaces and
    // newlines), the compose-box should re-open and thus the quoted
    // message should start from the beginning of compose-box.
    set_compose_content_with_caret("  \n\n \n %");
    compose_actions.quote_and_reply();
    assert.equal(get_compose_content_with_caret(), "[Quoting…]\n%");

    success_function({
        raw_content: "Testing with compose-box containing whitespaces and newlines only.",
    });
    assert.equal(
        get_compose_content_with_caret(),
        "translated: @_**Steve Stephenson|90** [said](https://chat.zulip.org/#narrow/stream/92-learning/topic/Tornado):\n```quote\nTesting with compose-box containing whitespaces and newlines only.\n```\n%",
    );
});
