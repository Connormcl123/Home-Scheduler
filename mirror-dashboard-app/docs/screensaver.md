# Screensaver photos

After a few minutes without a touch, the wall fades to family photos with a large clock. A tap brings the dashboard back; that tap does not press anything underneath.

Photos live on the Pi in `~/Home-Scheduler/mirror-dashboard-app/data/screensaver/`. That folder is outside git on purpose: the repo is public. JPG, PNG, WebP and AVIF work. Several photos become a slideshow in name order.

## Add a photo

From the PC (strip location data and size it for the screen first):

    python -c "from PIL import Image, ImageOps; im = ImageOps.exif_transpose(Image.open('photo.jpg')).convert('RGB'); im.thumbnail((1920, 1080)); im.save('family.jpg', quality=88)"
    scp family.jpg connor@192.168.1.185:~/Home-Scheduler/mirror-dashboard-app/data/screensaver/

The wall re-reads the folder every 30 minutes, so a new photo appears without a restart. Delete a file to take it out.

## Settings

In the Pi's `.env`, then restart the dashboard:

- `SCREENSAVER_IDLE_MINUTES` (default 5): quiet minutes before the photos show
- `SCREENSAVER_SLIDE_SECONDS` (default 60): time per photo when there are several

At night the photo dims, and everything drifts a few pixels each minute so nothing burns into the screen.
