Pod::Spec.new do |s|
  s.name           = 'LoreVision'
  s.version        = '1.0.0'
  s.summary        = 'Subject lifting for Lore stickers'
  s.description    = 'Cuts the subject out of a photo with Apple Vision and gives it a white sticker edge'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.0',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
