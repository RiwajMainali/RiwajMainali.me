use wasm_bindgen::prelude::*;
use sycamore::prelude::*;

#[wasm_bindgen]
pub fn run_app() -> Result<(), JsValue> {
    wasm_logger::init(wasm_logger::Config::default());

    let document = web_sys::window().unwrap().document().unwrap();
    let root = document.get_element_by_id("sycamore-root").unwrap();

    sycamore::render_to(|cx| {
        view! { cx,
            p { "Hello, World!" }
        }
    }, &root);

    Ok(())
}
