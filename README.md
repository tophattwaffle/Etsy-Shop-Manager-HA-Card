# Etsy Orders card

A Home Assistant dashboard card (`custom:etsy-orders-card`) that shows open Etsy orders as order cards, most urgent
first, with thumbnails, variations, personalization, ship-by urgency and Made checkboxes. It reads the Open orders
sensors of the [Etsy Shop Manager integration](https://github.com/tophattwaffle/Etsy-Shop-Manager-HA).

All options are described at the top of `etsy-orders-card.js`.

## Install

Copy `etsy-orders-card.js` to Home Assistant's `config/www/` folder and add it as a dashboard resource
(`/local/etsy-orders-card.js?v=<version>`, type *JavaScript module*). Bump `?v=` on every update so browsers load
the new file. HACS can also install it from `https://github.com/tophattwaffle/Etsy-Shop-Manager-HA-Card` (custom repository, category *Dashboard*), which adds the resource itself.

## Use

```yaml
type: custom:etsy-orders-card
shops:
  - entity: sensor.shopone_open_orders
    name: Shop One
  - entity: sensor.shoptwo_open_orders
    name: Shop Two
```

### Order colors

Order colors are set only in the app, under **Order colors**: the color list, tint strength, metal shine, the random
effect and whether effects move. Since card 3.0.0 the app sends each variation and personalization already drawn, with
the styles in the sensors' `color_config`, so the card shows exactly what the app's Orders page shows and has no color
options of its own (`colors`, `metallic`, `random_words`, `color_tint`, `metallic_shine`, `animate_metallic`,
`random_style`, `random_min_brightness` and `animate_random` in the YAML are ignored; remove them). Card 3.0.0 needs an
app version that sends drawn boxes; with an older app, variations show uncolored. Animations pause while the window is
unfocused or hidden and don't run when the device asks for reduced motion.

### Made checkboxes

With integration 0.4.0 or later, each item on the card has a Made checkbox (card v2.7.0). It is the same mark as on the
app's Orders and To make pages, so ticking it in either place shows in the other. For an item of several units, each
tap marks one more ("1/3", "2/3", …) and a tap on a fully made item clears it. Made items fade with their title struck
through, the shop's "To make" line counts only what's left, and tapping the checkbox doesn't open the order.
`show_made: false` hides the checkboxes.

### One list for all shops

`combine_shops: true` (card v2.8.0) shows every shop's orders in one list, most urgent first, as the app's Orders page
does, instead of a section per shop. A pill on the left of the header picks the shop: it shows only the shop's `icon`
(the app's storefront mark for **All shops**, the name for a shop without an icon), and tapping it opens a menu of
icons, full names and order counts (card v2.9.0). The chips and the "To make" line follow the choice. Under All shops
each order names its shop, and its outline is the shop's color. The choice is remembered on each device.
