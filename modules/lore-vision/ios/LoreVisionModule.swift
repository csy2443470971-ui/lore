import ExpoModulesCore
import Vision
import CoreImage
import UIKit
import CoreText
import MapKit

struct LiftError: Error, CustomStringConvertible {
  let description: String
}

/* Lore's own native piece: the subject of a photo, cut out the way iOS does when you hold a subject in Photos
   (Vision's foreground mask, on the phone, iOS 17+), given a white sticker edge and saved as a PNG. */
public class LoreVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LoreVision")

    /* uri: a photo on the phone. Returns the sticker's file, or nil when the photo has no clear subject */
    AsyncFunction("lift") { (uri: String) -> String? in
      return try Self.sticker(from: try Self.photo(uri))
    }

    /* the object inside a region the person circled: x, y, w, h are fractions of the photo, from its top left. Vision
       finds the object's own outline inside that region, so a rough circle is enough */
    /* whether a font (by its PostScript name) is on the phone and can be used now */
    Function("fontReady") { (name: String) -> Bool in
      return UIFont(name: name, size: 12) != nil
    }

    /* fetches fonts Apple offers to download (Songti and the like aren't on an iPhone until an app asks for them);
       resolves true once all of them can be used */
    AsyncFunction("fetchFont") { (names: [String], promise: Promise) in
      if names.allSatisfy({ UIFont(name: $0, size: 12) != nil }) { promise.resolve(true); return }
      let descriptors = names.map { CTFontDescriptorCreateWithNameAndSize($0 as CFString, 0) } as CFArray
      var done = false
      CTFontDescriptorMatchFontDescriptorsWithProgressHandler(descriptors, nil) { state, _ in
        if state == .didFinish && !done {
          done = true
          DispatchQueue.main.async { promise.resolve(names.allSatisfy { UIFont(name: $0, size: 12) != nil }) }
        }
        return true
      }
    }

    /* places from Apple Maps (free, no key; in China its data comes from AutoNavi): name, a short address, where it is.
       lat, lng: look around there first. Nothing found is an empty list. */
    AsyncFunction("searchPlaces") { (query: String, lat: Double?, lng: Double?) async throws -> [[String: Any]] in
      let req = MKLocalSearch.Request()
      req.naturalLanguageQuery = query
      if let lat = lat, let lng = lng {
        req.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), latitudinalMeters: 40_000, longitudinalMeters: 40_000)
      }
      guard let found = try? await MKLocalSearch(request: req).start() else { return [] }
      return found.mapItems.prefix(15).map { item in
        let pm = item.placemark, c = pm.coordinate
        var out: [String: Any] = ["name": item.name ?? pm.name ?? query, "lat": c.latitude, "lng": c.longitude]
        if let a = Self.shortAddress(pm) { out["address"] = a }
        return out
      }
    }

    /* a small map around a place with its pin, light or dark, saved as a PNG in Documents/places; w, h in points */
    AsyncFunction("mapSnapshot") { (lat: Double, lng: Double, w: Double, h: Double, dark: Bool) async throws -> String in
      let c = CLLocationCoordinate2D(latitude: lat, longitude: lng)
      let o = MKMapSnapshotter.Options()
      o.region = MKCoordinateRegion(center: c, latitudinalMeters: 900 * h / max(w, 1), longitudinalMeters: 900)
      o.size = CGSize(width: w, height: h)
      o.traitCollection = UITraitCollection(traitsFrom: [UITraitCollection(userInterfaceStyle: dark ? .dark : .light), UITraitCollection(displayScale: 3)])
      o.pointOfInterestFilter = .excludingAll
      let snap = try await MKMapSnapshotter(options: o).start()
      let fmt = UIGraphicsImageRendererFormat()
      fmt.scale = 3
      let img = UIGraphicsImageRenderer(size: o.size, format: fmt).image { ctx in
        snap.image.draw(at: .zero)
        let p = snap.point(for: c)
        ctx.cgContext.setShadow(offset: CGSize(width: 0, height: 1.5), blur: 4, color: UIColor.black.withAlphaComponent(0.3).cgColor)
        UIColor.white.setFill()
        UIBezierPath(ovalIn: CGRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18)).fill()
        ctx.cgContext.setShadow(offset: .zero, blur: 0, color: nil)
        UIColor(red: 0.94, green: 0.29, blue: 0.23, alpha: 1).setFill()
        UIBezierPath(ovalIn: CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12)).fill()
      }
      guard let data = img.pngData() else { throw LiftError(description: "no map") }
      let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("places", isDirectory: true)
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let url = dir.appendingPathComponent(String(UUID().uuidString.prefix(12)) + ".png")
      try data.write(to: url)
      return url.absoluteString
    }

    AsyncFunction("liftIn") { (uri: String, x: Double, y: Double, w: Double, h: Double) -> String? in
      let photo = try Self.photo(uri)
      let e = photo.extent
      let r = CGRect(x: e.minX + CGFloat(x) * e.width, y: e.minY + CGFloat(1 - y - h) * e.height,
                     width: CGFloat(w) * e.width, height: CGFloat(h) * e.height).intersection(e)
      guard r.width > 8, r.height > 8 else { return nil }
      let crop = photo.cropped(to: r).transformed(by: CGAffineTransform(translationX: -r.minX, y: -r.minY))
      return try Self.sticker(from: crop)
    }
  }

  /* street and city: Chinese from the city down, run together (上海市静安区南京西路1266号); otherwise "12 Main St, Brooklyn" */
  private static func shortAddress(_ p: MKPlacemark) -> String? {
    let han = { (s: String?) in (s ?? "").unicodeScalars.contains { $0.value >= 0x3400 && $0.value <= 0x9FFF } }
    if han(p.thoroughfare) || han(p.locality) {
      let s = [p.locality, p.subLocality, p.thoroughfare, p.subThoroughfare].compactMap { $0 }.joined()
      return s.isEmpty ? p.title : s
    }
    let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
    let s = [street, p.subLocality ?? p.locality ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
    return s.isEmpty ? p.title : s
  }

  private static func photo(_ uri: String) throws -> CIImage {
    guard let url = URL(string: uri), let photo = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      throw LiftError(description: "can't read the photo")
    }
    return photo
  }

  /* the subject of an image, with a white edge, saved as a PNG; nil when there is no clear subject */
  private static func sticker(from image: CIImage) throws -> String? {
    let ctx = CIContext()
    guard let cg = ctx.createCGImage(image, from: image.extent) else { throw LiftError(description: "can't read the photo") }
    let handler = VNImageRequestHandler(cgImage: cg)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let result = request.results?.first, !result.allInstances.isEmpty else { return nil }
    let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
    var cut = CIImage(cvPixelBuffer: masked)

    /* at most 900 px on the long side: big enough for the page, small enough to keep many */
    let long = max(cut.extent.width, cut.extent.height)
    if long > 900 { let s = 900 / long; cut = cut.transformed(by: CGAffineTransform(scaleX: s, y: s)) }
    let side = max(cut.extent.width, cut.extent.height)

    /* the white edge: the subject's own shape grown a little, filled white, under it */
    let edge = max(6, side * 0.035)
    let pad = edge + 6
    cut = cut.transformed(by: CGAffineTransform(translationX: pad - cut.extent.minX, y: pad - cut.extent.minY))
    let canvas = CGRect(x: 0, y: 0, width: cut.extent.width + 2 * pad, height: cut.extent.height + 2 * pad)
    let grown = cut.clampedToExtent().cropped(to: canvas)
      .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: edge])
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.2])
      .cropped(to: canvas)
    let white = grown.applyingFilter("CIColorMatrix", parameters: [
      "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
      "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
      "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
      "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
      "inputBiasVector": CIVector(x: 1, y: 1, z: 1, w: 0),
    ])
    let sticker = cut.composited(over: white).cropped(to: canvas)

    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let png = ctx.pngRepresentation(of: sticker, format: .RGBA8, colorSpace: space) else {
      throw LiftError(description: "can't make the sticker")
    }
    let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("stickers", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent(UUID().uuidString.prefix(10).lowercased() + ".png")
    try png.write(to: file)
    return file.absoluteString
  }
}
