# BPMN Editor

Онлайн-редактор BPMN 2.0 на базе [bpmn-js](https://bpmn.io/toolkit/bpmn-js/).

## Модель

Текущая BPMN-модель хранится в:

`diagrams/shop.bpmn`

GitHub Pages загружает этот файл напрямую. ChatGPT может обновлять BPMN-модель через подключение GitHub, после чего в редакторе достаточно нажать **«Обновить из GitHub»** или обновить страницу.

## Публикация

В GitHub откройте:

**Settings → Pages → Build and deployment → Deploy from a branch**

и выберите:

- Branch: `main`
- Folder: `/ (root)`

После публикации сайт будет доступен по адресу:

`https://sergeygalay.github.io/bpmn-editor/`
