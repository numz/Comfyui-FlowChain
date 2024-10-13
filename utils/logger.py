import logging
import re
import sys
from dataclasses import dataclass



def Logger():

    try:
        # Create logger
        logger = logging.getLogger(__name__)
        # set log level to no print
        #logger.setLevel(logging.CRITICAL)
        logger.setLevel(logging.DEBUG)
        if len(logger.handlers) > 0:
            logger.handlers.clear()
        console_level = "DEBUG"
        console_handler = logging.StreamHandler(stream=sys.stdout)
        console_handler.setLevel(console_level)
        console_format = "%(asctime)s %(levelname)-8s - %(message)s"
        colored_formatter = ColorizedArgsFormatter(console_format)
        console_handler.setFormatter(colored_formatter)
        logger.addHandler(console_handler)

        """
        file_handler = logging.FileHandler(log_filename)
        file_level = "DEBUG"
        file_handler.setLevel(file_level)
        file_format = "%(asctime)s %(levelname)-8s - %(lineno)-5s - %(filename)-20s - %(message)s"
        file_handler.setFormatter(BraceFormatStyleFormatter(file_format))
        logger.addHandler(file_handler)
        """
        return logger

    except Exception:
        err = sys.exc_info()
        # print("Error : %s" % (err))


@dataclass
class Log:
    _logger: logging.Logger = None
    _log_level: int = logging.DEBUG

    @property
    def log_level(self):
        return self._log_level

    @log_level.setter
    def log_level(self, log_level: int):
        self._log_level = log_level

    @property
    def logger(self):
        return self._logger

    @logger.setter
    def logger(self, logger: Logger):
        self._logger = logger
        self.set_level()

    def set_level(self):
        self.logger.setLevel(self.log_level)
        for handler in self.logger.handlers:
            handler.setLevel(self.log_level)


class ColorCodes:
    grey = "\x1b[38;21m"
    green = "\x1b[1;32m"
    yellow = "\x1b[33;21m"
    red = "\x1b[31;21m"
    bold_red = "\x1b[31;1m"
    blue = "\x1b[1;34m"
    light_blue = "\x1b[1;36m"
    purple = "\x1b[1;35m"
    reset = "\x1b[0m"


class ColorizedArgsFormatter(logging.Formatter):
    arg_colors = [ColorCodes.purple, ColorCodes.light_blue, ColorCodes.green, ColorCodes.yellow, ColorCodes.red]
    level_fields = ["levelname", "levelno"]
    level_to_color = {
        logging.DEBUG: ColorCodes.red,
        logging.INFO: ColorCodes.green,
        logging.WARNING: ColorCodes.yellow,
        logging.ERROR: ColorCodes.red,
        logging.CRITICAL: ColorCodes.bold_red,
    }

    def __init__(self, fmt: str):
        super().__init__()
        self.level_to_formatter = {}

        def add_color_format(level: int):
            color = ColorizedArgsFormatter.level_to_color[level]
            _format = fmt
            for fld in ColorizedArgsFormatter.level_fields:
                search = "(%\(" + fld + "\).*?s)"
                _format = re.sub(search, f"{color}\\1{ColorCodes.reset}", _format)

            formatter = logging.Formatter(_format)
            self.level_to_formatter[level] = formatter

        add_color_format(logging.DEBUG)
        add_color_format(logging.INFO)
        add_color_format(logging.WARNING)
        add_color_format(logging.ERROR)
        add_color_format(logging.CRITICAL)

    @staticmethod
    def rewrite_record(record: logging.LogRecord):
        if not BraceFormatStyleFormatter.is_brace_format_style(record):
            return

        msg = record.msg
        msg = msg.replace("{", "_{{")
        msg = msg.replace("}", "_}}")
        placeholder_count = 0
        # add ANSI escape code for next alternating color before each formatting parameter
        # and reset color after it.
        while True:
            if "_{{" not in msg:
                break
            color_index = placeholder_count % len(ColorizedArgsFormatter.arg_colors)
            color = ColorizedArgsFormatter.arg_colors[color_index]
            msg = msg.replace("_{{", color + "{", 1)
            msg = msg.replace("_}}", "}" + ColorCodes.reset, 1)
            placeholder_count += 1

        record.msg = msg.format(*record.args)
        record.args = []

    def format(self, record):

        orig_msg = record.msg
        orig_args = record.args
        formatter = self.level_to_formatter.get(record.levelno)

        self.rewrite_record(record)
        formatted = formatter.format(record)
        record.msg = orig_msg
        record.args = orig_args
        return formatted


class BraceFormatStyleFormatter(logging.Formatter):
    def __init__(self, fmt: str):
        super().__init__()
        self.formatter = logging.Formatter(fmt)

    @staticmethod
    def is_brace_format_style(record: logging.LogRecord):
        if len(record.args) == 0:
            return False

        msg = record.msg
        if '%' in msg:
            return False
        count_of_start_param = msg.count("{")
        count_of_end_param = msg.count("}")

        if count_of_start_param != count_of_end_param:
            return False

        if count_of_start_param != len(record.args):
            return False

        return True

    @staticmethod
    def rewrite_record(record: logging.LogRecord):
        if not BraceFormatStyleFormatter.is_brace_format_style(record):
            return
        record.msg = record.msg.format(*record.args)
        record.args = []

    def format(self, record):

        orig_msg = record.msg
        orig_args = record.args
        self.rewrite_record(record)
        formatted = self.formatter.format(record)

        # formatted = re.sub(r"\'(.*?)\': \'(.*?)\'", f"{ColorCodes.light_blue}\\1{ColorCodes.reset}: {ColorCodes.bold_red}\\2{ColorCodes.reset}", formatted)

        # restore log record to original state for other handlers
        record.msg = orig_msg
        record.args = orig_args
        return formatted

# logger = Logger('sdf')
# logger.info("{0} {1} {2}", "sdf", "sdf", "sdf")
