import ExpoModulesCore
import Vision
import CoreImage
import UIKit

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
