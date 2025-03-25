import shutil
from gradio_client import Client
import os
import subprocess
import folder_paths
import numpy as np
import hashlib
from .utils.utils import get_ffmpeg_path
import sys
from PIL import Image


class WorkflowLipSync:
    def __init__(self):
        self.ws = None

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "lipsync_studio_url": ("STRING", {"default": "http://127.0.0.1:7860/"}),
            "project_name": ("STRING", {"default": "project1"}),
            "frames": ("IMAGE",),
            "face_id": ("INT", {"default": 0, "min": 0, "max": 10, "step": 1}),
            "fps": ("FLOAT", {"default": 25., "min": 0., "max": 60., "step": 1}),
            "audio": ("AUDIO",),
            "avatar": (["Avatar 1", "Avatar 2", "Avatar 3", "Avatar 4", "Avatar 5", "Avatar 6", "Avatar 7", "Avatar 8", "Avatar 9", "Avatar 10"],),
            "close_mouth_before_lipsync": ("BOOLEAN", {"default": True}),
            "quality": (["Low", "Medium", "High"],),
            "skip_first_frames": ("INT", {"default": 0, "min": 0, "max": 10000, "step": 1}),
            "load_cap": ("INT", {"default": 0, "min": 0, "max": 10000, "step": 1}),
            "low_vram": ("BOOLEAN", {"default": False}),

        },
            "optional": {
                "faceswap_image": ("IMAGE",),
            }}

    # RETURN_TYPES = ("STRING", "STRING")
    RETURN_TYPES = ()
    # RETURN_NAMES = ("faceswap_video_path", "lipsync_video_path")
    RETURN_NAMES = ()
    FUNCTION = "generate"
    CATEGORY = "FlowChain ⛓️"

    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(s, project_name, **kworgs):
        m = hashlib.sha256()
        m.update(project_name.encode())
        return m.digest().hex()

    def generate(self, lipsync_studio_url, project_name, frames, fps, face_id, audio, avatar, close_mouth_before_lipsync, quality, skip_first_frames,
                 load_cap, low_vram, faceswap_image=None, **kwargs):
        client = Client(lipsync_studio_url, verbose=False)
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            project_name, folder_paths.get_output_directory(), frames[0].shape[1], frames[0].shape[0])
        # Set project name
        client.predict(project_name, api_name="/set_project_name")
        frame_list = []
        counter = 0
        if not os.path.exists(os.path.join(full_output_folder, project_name)):
            os.makedirs(os.path.join(full_output_folder, project_name))
        for (batch_number, image) in enumerate(frames):
            i = 255. * image.cpu().numpy()
            filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
            file = f"{filename_with_batch_num}_{counter:05}_.png"
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img.save(os.path.join(full_output_folder, project_name, file), compress_level=4)
            img_info = {
                'path': os.path.join(full_output_folder, project_name, file)
            }
            frame_list.append(img_info)
            counter += 1

        client.predict(
            frame_list,
            fps,
            api_name="/new_frames"
        )
        if load_cap == 0:
            load_cap = len(frames)

        client.predict(
            skip_first_frames + 1,  # float (numeric value between 1 and 1) in 'Trim Video Start' Slider component
            api_name="/video_start_frame"
        )
        client.predict(
            load_cap + 1,  # float (numeric value between 1 and 1) in 'Trim Video Start' Slider component
            api_name="/video_stop_frame"
        )

        if faceswap_image is not None:
            i = 255. * faceswap_image[0].cpu().numpy()
            file = f"faceswap_{counter:05}_.png"
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img.save(os.path.join(full_output_folder, project_name, file), compress_level=4)
            client.predict(
                os.path.join(full_output_folder, project_name, file),
                # filepath  in 'Face Swap' Image component
                api_name="/new_face_swap_img"
            )
        else:
            client.predict(
                None,
                # filepath  in 'Face Swap' Image component
                api_name="/new_face_swap_img"
            )

        client.predict(
            1,
            # float (numeric value between 1 and 4) in 'Resolution Divide Factor' Slider component
            30,  # float (numeric value between 0 and 100) in 'Min Face Width Detection' Slider component
            True,  # bool  in 'Keyframes On Speaker Change' Checkbox component
            True,  # bool  in 'Keyframes On Scene Change' Checkbox component
            skip_first_frames + 1,  # int 'Trim Video Start' Slider component
            load_cap,  # float (numeric value between 1 and 1) in 'Trim Video Stop' Slider component
            4,  # float (numeric value between 1 and 64) in 'Number of CPU' Slider component
            1000,
            api_name="/analyse_video"
        )
        # Set Audio Type
        client.predict(
            # config["audio_path"] if config["audio_path"] else "Input Video",# Literal['File', 'Generate', 'Input Video']  in 'Audio Input' Radio component
            "File",  # Literal['File', 'Generate', 'Input Video']  in 'Audio Input' Radio component
            api_name="/set_audio_type"
        )
        output_file_audio = f"{filename}_{counter:05}.wav"
        output_file_audio_path = os.path.join(full_output_folder, project_name, output_file_audio)

        # FFmpeg command to save audio in WAV format
        channels = audio['waveform'].size(1)

        wav_args = [ffmpeg_path(), "-v", "error", "-n",
                    "-ar", str(audio['sample_rate']),  # Sample rate
                    "-ac", str(channels),  # Number of channels
                    "-f", "f32le", "-i", "-",  # Audio format and input from stdin
                    "-c:a", "pcm_s16le",  # Encode as 16-bit PCM WAV
                    output_file_audio_path]
        env = os.environ.copy()
        audio_data = audio['waveform'].squeeze(0).transpose(0, 1) \
            .numpy().tobytes()

        try:
            res = subprocess.run(wav_args, input=audio_data,
                                 env=env, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            raise Exception("An error occurred in the ffmpeg subprocess:\n" \
                            + e.stderr.decode("utf-8"))

        if res.stderr:
            print(res.stderr.decode("utf-8"), end="", file=sys.stderr)

        client.predict(
            output_file_audio_path,
            # filepath  in 'Speech' Audio component
            api_name="/set_audio_file"
        )
        client.predict(
            avatar,
            # Literal['None', 'Avatar 1', 'Avatar 2', 'Avatar 3', 'Avatar 4', 'Avatar 5', 'Avatar 6', 'Avatar 7', 'Avatar 8', 'Avatar 9', 'Avatar 10']  in 'Avatar' Dropdown component
            api_name="/change_avatar"
        )
        client.predict(
            low_vram,  # bool  in 'Low VRAM' Checkbox component
            api_name="/set_low_vram"
        )
        client.predict(
            avatar,
            api_name="/generate_driving_video"
        )
        client.predict(
            quality,  # Literal['Low', 'Medium', 'High', 'Best']  in 'Video Quality' Radio component
            api_name="/set_video_quality"
        )
        for id_speaker in range(face_id):
            client.predict(
                str(id_speaker),  # Literal[]  in 'Face Id' Dropdown component
                False,  # bool  in 'Show wav2lip Output' Checkbox component
                api_name="/set_face_id"
            )
            client.predict(
                False,  # bool  in 'Speaker' Checkbox component
                api_name="/set_speaker"
            )
            if faceswap_image is not None:
                client.predict(
                    "None",  # Literal[]  in 'Face swap id' Radio component
                    api_name="/set_faceswap"
                )

        client.predict(
            str(face_id),  # Literal[]  in 'Face Id' Dropdown component
            False,  # bool  in 'Show wav2lip Output' Checkbox component
            api_name="/set_face_id"
        )

        client.predict(
            True,  # bool  in 'Speaker' Checkbox component
            api_name="/set_speaker"
        )

        if faceswap_image is not None:
            client.predict(
                "0",  # Literal[]  in 'Face swap id' Radio component
                api_name="/set_faceswap"
            )
            client.predict(
                api_name="/generate_faceswap"
            )

        client.predict(
            True,  # bool  in 'Stop video' Checkbox component
            api_name="/set_stop_video"
        )
        client.predict(
            close_mouth_before_lipsync,  # bool  in 'Stop video' Checkbox component
            api_name="/set_face_zero"
        )

        # Generate Wav2lip
        result = client.predict(
            1,  # float (numeric value between 1 and 100) in 'Volume Amplifier' Slider component
            api_name="/generate_w2l"
        )
        output_dir = folder_paths.get_output_directory()
        video_path = result["value"]["video"]
        new_path = os.path.join(output_dir, project_name, os.path.split(video_path)[-1])
        if not os.path.exists(new_path):
            shutil.copy(video_path, new_path)
        return {"ui": {"video_path": [new_path, project_name]}}
        # return (video_path, faceswap_video)


# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "WorkflowLipSync": WorkflowLipSync,
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "WorkflowLipSync": "Workflow LipSync (FlowChain ⛓️)",
}
